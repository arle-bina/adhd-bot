import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getMarketShare, SectorType, MarketShareResponse } from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";

export const cooldown = 10;

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  UK: "United Kingdom",
  CA: "Canada",
  DE: "Germany",
};

// Distinct palette for companies without a brand color
const SLICE_PALETTE = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
  "#42d4f4", "#f032e6", "#bfef45", "#fabed4", "#469990",
  "#dcbeff", "#9A6324", "#fffac8", "#800000", "#aaffc3",
];

export const data = new SlashCommandBuilder()
  .setName("marketshare")
  .setDescription("View market share by sector")
  .addStringOption((option) =>
    option
      .setName("sector")
      .setDescription("Industry sector")
      .setRequired(true)
      .addChoices(
        { name: "Financial", value: "financial" },
        { name: "Media", value: "media" },
        { name: "Manufacturing", value: "manufacturing" },
        { name: "Healthcare", value: "healthcare" },
        { name: "Retail", value: "retail" },
        { name: "Automobiles", value: "automobiles" },
        { name: "Technology", value: "technology" },
        { name: "Energy", value: "energy" },
        { name: "Agriculture", value: "agriculture" },
        { name: "Real Estate", value: "real_estate" },
        { name: "Defense", value: "defense" },
        { name: "Telecommunications", value: "telecommunications" },
        { name: "Entertainment", value: "entertainment" },
        { name: "Logistics", value: "logistics" },
        { name: "Extraction", value: "extraction" },
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
        { name: "Canada", value: "CA" },
        { name: "Germany", value: "DE" },
      )
  )
  .addStringOption((option) =>
    option
      .setName("state")
      .setDescription("State ID (e.g. US_CA, UK_ENG)")
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName("page")
      .setDescription("Page number (default: 1)")
      .setRequired(false)
      .setMinValue(1)
  );

function buildScopeLabel(result: MarketShareResponse): string {
  if (result.scope.stateName) return result.scope.stateName;
  if (result.scope.country) return COUNTRY_NAMES[result.scope.country] ?? result.scope.country;
  return "Global";
}

function buildChartUrl(result: MarketShareResponse, showUnowned: boolean): string {
  const labels: string[] = [];
  const values: number[] = [];
  const colors: string[] = [];

  for (let i = 0; i < result.companies.length; i++) {
    const c = result.companies[i];
    labels.push(c.corporationName);
    values.push(c.marketSharePercent);
    colors.push(c.brandColor ?? SLICE_PALETTE[i % SLICE_PALETTE.length]);
  }

  // "Others" slice: owned revenue not on this page
  const pageOwnedPct = result.companies.reduce((s, c) => s + c.marketSharePercent, 0);
  const totalOwnedPct = result.totalMarket > 0
    ? (result.totalOwnedRevenue / result.totalMarket) * 100
    : 0;
  const othersPct = Math.max(0, totalOwnedPct - pageOwnedPct);
  if (othersPct > 0.01) {
    labels.push("Others");
    values.push(Math.round(othersPct * 100) / 100);
    colors.push("#555555");
  }

  if (showUnowned && result.unownedPercent > 0.01) {
    labels.push("Unowned");
    values.push(result.unownedPercent);
    colors.push("#808080");
  }

  const config = {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
        datalabels: {
          color: "#fff",
          font: { size: 11, weight: "bold" },
          formatter: (v: number) => v >= 3 ? `${v.toFixed(1)}%` : "",
        },
      },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?c=${encoded}&w=400&h=400&bkg=%23232428`;
}

function gameSiteOrigin(): string {
  try {
    return new URL(process.env.GAME_API_URL!).origin;
  } catch {
    return "https://www.ahousedividedgame.com";
  }
}

function buildEmbed(result: MarketShareResponse, showUnowned: boolean): EmbedBuilder {
  const scopeLabel = buildScopeLabel(result);
  const title = `${result.sectorLabel} — ${scopeLabel}`;

  const embedColor =
    result.companies.length > 0 && result.companies[0].brandColor
      ? hexToInt(result.companies[0].brandColor)
      : 0x2b2d31;

  const embed = new EmbedBuilder()
    .setTitle(title.slice(0, 256))
    .setColor(embedColor);

  if (result.companies.length === 0) {
    embed.setDescription("No corporations in this market yet.");
  } else {
    const lines = result.companies.map((c, i) => {
      const rank = (result.page - 1) * result.pageSize + i + 1;
      const tag = c.isNatcorp ? " · NatCorp" : "";
      const corpHref = c.corporationSequentialId != null
        ? new URL(`/corporation/${c.corporationSequentialId}`, gameSiteOrigin()).href
        : null;
      const nameStr = corpHref ? `[${c.corporationName}](${corpHref})` : c.corporationName;
      return `${rank}. **${nameStr}** — ${c.marketSharePercent.toFixed(2)}% · $${c.revenue.toLocaleString()}${tag}`;
    });
    embed.setDescription(lines.join("\n").slice(0, 4096));
    embed.setImage(buildChartUrl(result, showUnowned));
  }

  const footerParts: string[] = [];
  if (result.totalPages > 1) {
    footerParts.push(`Page ${result.page}/${result.totalPages}`);
  }
  footerParts.push(`Unowned: ${result.unownedPercent.toFixed(2)}%`);
  if (result.totalMarket > 0) {
    footerParts.push(`TAM: $${result.totalMarket.toLocaleString()}`);
  }
  footerParts.push("ahousedividedgame.com");
  embed.setFooter({ text: footerParts.join(" · ") });

  return embed;
}

function buildNavRow(page: number, totalPages: number, showUnowned: boolean): ActionRowBuilder<ButtonBuilder> {
  const buttons: ButtonBuilder[] = [];

  if (totalPages > 1) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("marketshare_prev")
        .setLabel("◀ Prev")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId("marketshare_next")
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages),
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId("marketshare_unowned")
      .setLabel(showUnowned ? "Hide Unowned" : "Show Unowned")
      .setStyle(showUnowned ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const type = interaction.options.getString("sector", true) as SectorType;
  const country = interaction.options.getString("country") ?? undefined;
  const state = interaction.options.getString("state") ?? undefined;
  let page = interaction.options.getInteger("page") ?? 1;
  let showUnowned = false;

  await interaction.deferReply();

  try {
    let result = await getMarketShare({ type, country, state, page });

    if (!result.found) {
      await interaction.editReply({ content: "Could not retrieve market share data for that query." });
      return;
    }

    if (result.companies.length === 0 && result.totalPages <= 1) {
      await interaction.editReply({ embeds: [buildEmbed(result, showUnowned)] });
      return;
    }

    const totalPages = result.totalPages;

    const message = await interaction.editReply({
      embeds: [buildEmbed(result, showUnowned)],
      components: [buildNavRow(page, totalPages, showUnowned)],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: "Use `/marketshare` yourself to browse.", ephemeral: true });
        return;
      }

      await btn.deferUpdate();

      let needsFetch = false;

      if (btn.customId === "marketshare_prev") {
        page = Math.max(1, page - 1);
        needsFetch = true;
      } else if (btn.customId === "marketshare_next") {
        page = Math.min(totalPages, page + 1);
        needsFetch = true;
      } else if (btn.customId === "marketshare_unowned") {
        showUnowned = !showUnowned;
      }

      try {
        if (needsFetch) {
          result = await getMarketShare({ type, country, state, page });
        }
        await btn.editReply({
          embeds: [buildEmbed(result, showUnowned)],
          components: [buildNavRow(page, totalPages, showUnowned)],
        });
      } catch (error) {
        await replyWithError(interaction, "marketshare", error);
      }
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  } catch (error) {
    await replyWithError(interaction, "marketshare", error);
  }
}
