import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getLeaderboard, LeaderboardCharacter, LeaderboardMetric } from "../utils/api.js";
import { replyWithError } from "../utils/helpers.js";
import { respondCountryAutocomplete, validateCountry } from "../utils/countryChoices.js";
import { COUNTRY_NAMES } from "../utils/formatting.js";
import { currencyFor, formatCurrency, convertCurrency, fetchForexRates, symbolFor, CURRENCY_CHOICES, CURRENCY_SYMBOLS } from "../utils/currency.js";
import { renderBarChart, brandColor, compactMoney, compactNumber, type BarRow } from "../utils/viz/index.js";
import { chartAttachment } from "../utils/viz/attach.js";
import { linkList, subtext, meta } from "../utils/embeds.js";

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
      .setAutocomplete(true)
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

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await respondCountryAutocomplete(interaction);
}

const metricLabels: Record<LeaderboardMetric, string> = {
  politicalInfluence: "Political Influence",
  nationalPoliticalInfluence: "National Political Influence",
  favorability: "Favorability",
  actions: "Actions",
  funds: "Funds",
};

/**
 * A leaderboard is a ranking, which is what a bar chart is for. Bars carry the
 * gaps between players — that the top name has three times the influence of
 * the tenth is invisible in a numbered list.
 */
function buildLeaderboardChart(
  characters: LeaderboardCharacter[],
  metric: LeaderboardMetric,
  page: number,
  totalPages: number,
  country: string | undefined,
  displayCurrency: string,
  rates: Record<string, number>,
): Buffer {
  const start = page * PAGE_SIZE;
  const slice = characters.slice(start, start + PAGE_SIZE);
  const sym = symbolFor(displayCurrency);
  const sourceCc = country ? currencyFor(country) : "USD";

  const rows: BarRow[] = slice.map((char, i) => {
    const raw = getMetricValue(char, metric);
    const value =
      metric === "funds" ? convertCurrency(raw, sourceCc, displayCurrency, rates) : raw;
    return {
      label: char.name,
      value: Math.max(0, value),
      // Party colour is the player's identity here, not their rank.
      color: brandColor(char.partyColor, i),
      primary: metric === "funds" ? compactMoney(value, sym) : compactNumber(raw),
      tag: [char.position, char.stateCode].filter(Boolean).join(" · ") || undefined,
    };
  });

  const scope = country ? COUNTRY_NAMES[country] ?? country.toUpperCase() : "Global";
  const footer = [`Values ${displayCurrency}`];
  if (metric !== "funds") footer.shift();

  return renderBarChart({
    title: `${metricLabels[metric]} — ${scope}`,
    subtitle: totalPages > 1 ? `Top politicians · page ${page + 1} of ${totalPages}` : "Top politicians",
    footerLeft: footer.join(" · ") || undefined,
    startRank: start + 1,
    labelFraction: 0.42,
    rows,
  });
}

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

  /*
   * The chart ranks these players with their office, state and metric value, so
   * this is a link run to each profile rather than a second copy of the table.
   */
  const links = linkList(slice.map((char) => ({ label: char.name, url: char.profileUrl })));

  const leader = slice[0];
  const leaderValue = (() => {
    if (!leader) return null;
    const raw = getMetricValue(leader, metric);
    if (metric !== "funds") return raw.toLocaleString();
    const cc = country ? currencyFor(country) : "USD";
    return formatCurrency(Math.round(convertCurrency(raw, cc, displayCurrency, rates)), displayCurrency);
  })();

  const footerParts: string[] = [];
  if (totalPages > 1) footerParts.push(`Page ${page + 1} of ${totalPages}`);
  if (country) footerParts.push(`Country: ${country}`);
  if (metric === "funds" && displayCurrency !== "USD" && rates[displayCurrency] && rates[displayCurrency] !== 1) {
    const sym = CURRENCY_SYMBOLS[displayCurrency] ?? displayCurrency;
    const rateVal = displayCurrency === "JPY" ? rates[displayCurrency].toFixed(2) : rates[displayCurrency].toFixed(4);
    footerParts.push(`1 INT = ${sym}${rateVal} ${displayCurrency}`);
  }
  footerParts.push("ahousedividedgame.com");

  return new EmbedBuilder()
    .setTitle(`Top Politicians -- ${metricLabel}`)
    .setColor(0x2b2d31)
    .setDescription(
      [
        links,
        subtext(meta(leader && `Leading: ${leader.name} ${leaderValue}`, `${slice.length} shown`)),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setFooter({ text: footerParts.join(" · ") });
}

/**
 * Embed plus chart. The description keeps the profile hyperlinks — an image
 * cannot be clicked — and doubles as the text equivalent of the chart.
 */
function buildLeaderboardReply(
  characters: LeaderboardCharacter[],
  metric: LeaderboardMetric,
  page: number,
  totalPages: number,
  country: string | undefined,
  displayCurrency: string,
  rates: Record<string, number>,
) {
  const embed = buildLeaderboardEmbed(characters, metric, page, totalPages, country, displayCurrency, rates);
  const chart = chartAttachment(
    buildLeaderboardChart(characters, metric, page, totalPages, country, displayCurrency, rates),
    "leaderboard",
    `${metric}-${page}`,
  );
  embed.setImage(chart.url);
  return { embeds: [embed], files: [chart.file] };
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

  /*
   * Autocomplete does not constrain submitted values the way choices did, so
   * re-check here. Runs AFTER deferReply: a cold country cache makes an HTTP
   * call (60s client timeout) and Discord kills an un-acknowledged interaction
   * after 3s.
   */
  const check = await validateCountry(country ?? null);
  if (!check.ok) {
    await interaction.editReply({ content: check.message });
    return;
  }

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
      await interaction.editReply(
        buildLeaderboardReply(characters, result.metric, 0, 1, country, displayCurrency, rates),
      );
      return;
    }

    const message = await interaction.editReply({
      ...buildLeaderboardReply(characters, result.metric, page, totalPages, country, displayCurrency, rates),
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
        ...buildLeaderboardReply(characters, result.metric, page, totalPages, country, displayCurrency, rates),
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