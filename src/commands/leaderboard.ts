import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getLeaderboard, LeaderboardCharacter, LeaderboardMetric } from "../utils/api.js";
import { replyWithError, standardFooter } from "../utils/helpers.js";
import { currencyFor, formatCurrency, convertCurrency, fetchForexRates, CURRENCY_CHOICES } from "../utils/currency.js";

// Explicit conditional avoids TypeScript's TS7053 "any" error from dynamic key indexing (char[metric]).
export function getMetricValue(
  char: LeaderboardCharacter,
  metric: LeaderboardMetric
): number {
  if (metric === "favorability") return char.favorability;
  if (metric === "nationalPoliticalInfluence") return char.nationalPoliticalInfluence;
  if (metric === "actions") return char.actions;
  if (metric === "funds") return char.funds;
  return char.politicalInfluence;
}

const PAGE_SIZE = 10;

export const cooldown = 10;

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show top politicians ranked by various metrics")
  .addStringOption((option) =>
    option
      .setName("metric")
      .setDescription("What to rank by")
      .setRequired(false)
      .addChoices(
        { name: "Political Influence (default)", value: "influence" },
        { name: "National Political Influence", value: "nationalPoliticalInfluence" },
        { name: "Favorability", value: "favorability" },
        { name: "Actions", value: "actions" },
        { name: "Funds", value: "funds" }
      )
  )
  .addStringOption((option) =>
    option
      .setName("country")
      .setDescription("Filter by country")
      .setRequired(false)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" },
        { name: "Japan", value: "JP" },
        { name: "Canada", value: "CA" },
        { name: "Germany", value: "DE" }
      )
  )
  .addIntegerOption((option) =>
    option
      .setName("limit")
      .setDescription("Number of results (max 25, default 10)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(25)
  )
  .addStringOption((option) =>
    option
      .setName("currency")
      .setDescription("Display currency for Funds metric (default: country's native currency)")
      .setRequired(false)
      .addChoices(...CURRENCY_CHOICES)
  );

const metricLabels: Record<LeaderboardMetric, string> = {
  politicalInfluence: "Political Influence",
  nationalPoliticalInfluence: "National Political Influence",
  favorability: "Favorability",
  actions: "Actions",
  funds: "Funds",
};

function buildLeaderboardEmbed(
  characters: LeaderboardCharacter[],
  metric: LeaderboardMetric,
  page: number,
  totalPages: number,
  country: string | undefined,
  displayCurrency: string,
  rates: Record<string, number>,
): EmbedBuilder {
  const start = page * PAGE_SIZE;
  const slice = characters.slice(start, start + PAGE_SIZE);
  const metricLabel = metricLabels[metric];

  const nativeCc = country ? currencyFor(country) : "USD";
  const lines = slice.map((char) => {
    const raw = getMetricValue(char, metric);
    let value: string;
    if (metric === "funds") {
      const cc = country ? currencyFor(country) : "USD";
      const converted = Math.round(convertCurrency(raw, cc, displayCurrency, rates));
      value = formatCurrency(converted, displayCurrency);
    } else {
      value = raw.toLocaleString();
    }
    const nameStr = char.profileUrl ? `[${char.name}](${char.profileUrl})` : char.name;
    return `${char.rank}. **${nameStr}** -- ${char.position} · ${char.party} · ${value}`;
  });

  const footerParts: string[] = [];
  if (totalPages > 1) footerParts.push(`Page ${page + 1} of ${totalPages}`);
  if (country) footerParts.push(`Country: ${country}`);
  if (metric === "funds" && displayCurrency !== "USD" && rates[displayCurrency] && rates[displayCurrency] !== 1) {
    const sym = { USD: "$", GBP: "£", JPY: "¥", CAD: "C$", EUR: "€" }[displayCurrency] ?? displayCurrency;
    const rateVal = displayCurrency === "JPY" ? rates[displayCurrency].toFixed(2) : rates[displayCurrency].toFixed(4);
    footerParts.push(`1 INT = ${sym}${rateVal} ${displayCurrency}`);
  }
  footerParts.push("ahousedividedgame.com");

  return new EmbedBuilder()
    .setTitle(`Top Politicians -- ${metricLabel}`)
    .setColor(0x2b2d31)
    .setDescription(lines.join("\n"))
    .setFooter({ text: footerParts.join(" · ") });
}

function buildNavRow(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("lb_prev")
      .setLabel("Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId("lb_next")
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const metric = interaction.options.getString("metric") ?? "influence";
  const country = interaction.options.getString("country") ?? undefined;
  const limit = interaction.options.getInteger("limit") ?? 10;
  const explicitCurrency = interaction.options.getString("currency") ?? undefined;

  await interaction.deferReply();

  try {
    const [result, rates] = await Promise.all([
      getLeaderboard({ metric, country, limit }),
      fetchForexRates(),
    ]);

    if (!result.found || result.characters.length === 0) {
      await interaction.editReply({ content: "No politicians found." });
      return;
    }

    const displayCurrency = explicitCurrency || (country ? currencyFor(country) : "USD");
    const characters = result.characters;
    const totalPages = Math.ceil(characters.length / PAGE_SIZE);
    let page = 0;

    if (totalPages <= 1) {
      await interaction.editReply({
        embeds: [buildLeaderboardEmbed(characters, result.metric, 0, 1, country, displayCurrency, rates)],
      });
      return;
    }

    const message = await interaction.editReply({
      embeds: [buildLeaderboardEmbed(characters, result.metric, page, totalPages, country, displayCurrency, rates)],
      components: [buildNavRow(page, totalPages)],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: "Use `/leaderboard` yourself to browse.", ephemeral: true });
        return;
      }
      await btn.deferUpdate();
      if (btn.customId === "lb_prev") page = Math.max(0, page - 1);
      if (btn.customId === "lb_next") page = Math.min(totalPages - 1, page + 1);
      await btn.editReply({
        embeds: [buildLeaderboardEmbed(characters, result.metric, page, totalPages, country, displayCurrency, rates)],
        components: [buildNavRow(page, totalPages)],
      });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  } catch (error) {
    await replyWithError(interaction, "leaderboard", error);
  }
}