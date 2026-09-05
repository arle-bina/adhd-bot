import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getSectors, SectorType, OwnedSectorsResponse, UnownedSectorsResponse } from "../utils/api.js";
import { replyWithError } from "../utils/helpers.js";
import {
  formatCurrency,
  fetchForexRates,
  convertCurrency,
  currencyFor,
  CURRENCY_CHOICES,
  symbolFor,
} from "../utils/currency.js";
import { renderBarChart, seriesColor, signedPercent, compactMoney, STATUS, OTHERS, type BarRow } from "../utils/viz/index.js";
import { chartAttachment } from "../utils/viz/attach.js";

export const cooldown = 10;

function gameSiteOrigin(): string {
  try {
    return new URL(process.env.GAME_API_URL!).origin;
  } catch {
    return "https://www.ahousedividedgame.com";
  }
}

/** Keep path/query from API URLs but use the configured game origin (API may use a stale NEXT_PUBLIC_BASE_URL). */
function normalizeGamePageUrl(href: string): string {
  try {
    const u = new URL(href);
    return new URL(u.pathname + u.search + u.hash, gameSiteOrigin()).href;
  } catch {
    return href;
  }
}

export const data = new SlashCommandBuilder()
  .setName("sectors")
  .setDescription("View sector data by industry type")
  .addStringOption((option) =>
    option
      .setName("type")
      .setDescription("Industry type")
      .setRequired(true)
      .addChoices(
        { name: "Financial", value: "financial" },
        { name: "Media", value: "media" },
        { name: "Manufacturing", value: "manufacturing" },
        { name: "Chemical Industries", value: "chemical_industries" },
        { name: "Healthcare", value: "healthcare" },
        { name: "Retail", value: "retail" },
        { name: "Automobiles", value: "automobiles" },
        { name: "Technology", value: "technology" },
        { name: "Energy", value: "energy" },
        { name: "Agriculture", value: "agriculture" },
        { name: "Real Estate", value: "real_estate" },
        { name: "Construction", value: "construction" },
        { name: "Defense", value: "defense" },
        { name: "Telecommunications", value: "telecommunications" },
        { name: "Entertainment", value: "entertainment" },
        { name: "Logistics", value: "logistics" },
        { name: "Extraction", value: "extraction" },
      )
  )
  .addBooleanOption((option) =>
    option
      .setName("unowned")
      .setDescription("Show unowned market instead (default: false)")
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName("page")
      .setDescription("Page number (default: 1)")
      .setRequired(false)
      .setMinValue(1)
  )
  .addStringOption((option) =>
    option
      .setName("currency")
      .setDescription("Display currency (default: USD)")
      .setRequired(false)
      .addChoices(...CURRENCY_CHOICES)
  );

function buildOwnedEmbed(result: OwnedSectorsResponse, targetCurrency: string, rates: Record<string, number>): EmbedBuilder {
  const lines = result.sectors.map((sector, index) => {
    const rank = (result.page - 1) * 10 + index + 1;
    const sectorHref = normalizeGamePageUrl(sector.sectorUrl);
    // Sector revenue is in the corp's local currency (liquidCurrencyCode).
    // Convert from that currency to the user's chosen display currency.
    const sourceCurrency = sector.liquidCurrencyCode ?? currencyFor(sector.countryId);
    const rev = convertCurrency(sector.revenue, sourceCurrency, targetCurrency, rates);
    const growth = sector.currentGrowthRate ?? sector.growthRate ?? 0;
    return `${rank}. [**${sector.corporationName}** — ${sector.stateName}](${sectorHref}) · ${formatCurrency(rev, targetCurrency)} rev · ${growth.toFixed(1)}% growth · ${sector.workers.toLocaleString()} workers`;
  });

  return new EmbedBuilder()
    .setTitle(`🏭 ${result.sectorLabel} Sectors`)
    .setColor(0x3b82f6)
    .setDescription(lines.join("\n").slice(0, 4096))
    .setFooter({
      text: `Page ${result.page}/${result.totalPages} · ${result.totalItems} total sectors · Values in ${targetCurrency} · ahousedividedgame.com`,
    });
}

function buildUnownedEmbed(result: UnownedSectorsResponse, targetCurrency: string, rates: Record<string, number>): EmbedBuilder {
  const lines = result.sectors.map((sector, index) => {
    const rank = (result.page - 1) * 10 + index + 1;
    const stateHref = new URL(`/state/${encodeURIComponent(sector.stateId)}`, gameSiteOrigin()).href;
    // All market amounts are in anchor currency (₳ = USD).
    const unowned = convertCurrency(sector.unownedRevenue, "USD", targetCurrency, rates);
    const total = convertCurrency(sector.totalMarket, "USD", targetCurrency, rates);
    return `${rank}. [**${sector.stateName}**](${stateHref}) — ${formatCurrency(unowned, targetCurrency)} unowned (of ${formatCurrency(total, targetCurrency)} total)`;
  });

  return new EmbedBuilder()
    .setTitle(`🏭 ${result.sectorLabel} — Unowned Market`)
    .setColor(0x57f287)
    .setDescription(lines.join("\n").slice(0, 4096))
    .setFooter({
      text: `Page ${result.page}/${result.totalPages} · ${result.totalItems} states with unowned market · Values in ${targetCurrency} · ahousedividedgame.com`,
    });
}

/**
 * Owned sectors ranked by revenue. Growth rides along as a signed secondary
 * column — a second bar would need a second scale, and two scales in one frame
 * is how unrelated series get made to look correlated.
 */
function buildOwnedChart(
  result: OwnedSectorsResponse,
  targetCurrency: string,
  rates: Record<string, number>,
): Buffer {
  const sym = symbolFor(targetCurrency);
  const rows: BarRow[] = result.sectors.map((sector, i) => {
    const sourceCurrency = sector.liquidCurrencyCode ?? currencyFor(sector.countryId);
    const rev = convertCurrency(sector.revenue, sourceCurrency, targetCurrency, rates);
    const growth = sector.currentGrowthRate ?? sector.growthRate ?? 0;
    return {
      label: sector.corporationName,
      value: Math.max(0, rev),
      color: seriesColor(i % 8),
      primary: compactMoney(rev, sym),
      secondary: signedPercent(growth),
      tag: sector.stateName,
    };
  });

  return renderBarChart({
    title: `${result.sectorLabel} — top sectors by revenue`,
    subtitle:
      result.totalPages > 1
        ? `${result.totalItems} sectors · page ${result.page} of ${result.totalPages}`
        : `${result.totalItems} sectors`,
    footerLeft: `Revenue · growth % · Values ${targetCurrency}`,
    startRank: (result.page - 1) * 10 + 1,
    labelFraction: 0.38,
    rows,
  });
}

/** Unowned market by state — how much of this sector is still up for grabs. */
function buildUnownedChart(
  result: UnownedSectorsResponse,
  targetCurrency: string,
  rates: Record<string, number>,
): Buffer {
  const sym = symbolFor(targetCurrency);
  const rows: BarRow[] = result.sectors.map((sector) => {
    const unowned = convertCurrency(sector.unownedRevenue, "USD", targetCurrency, rates);
    const total = convertCurrency(sector.totalMarket, "USD", targetCurrency, rates);
    const share = total > 0 ? (unowned / total) * 100 : 0;
    return {
      label: sector.stateName,
      value: Math.max(0, unowned),
      // Unowned market is opportunity, not identity — one reserved status hue.
      color: share >= 50 ? STATUS.good : OTHERS,
      primary: compactMoney(unowned, sym),
      secondary: `${share.toFixed(0)}% free`,
      tag: undefined,
    };
  });

  return renderBarChart({
    title: `${result.sectorLabel} — unowned market`,
    subtitle:
      result.totalPages > 1
        ? `${result.totalItems} states with room · page ${result.page} of ${result.totalPages}`
        : `${result.totalItems} states with room`,
    footerLeft: `Unowned revenue · share of state market · Values ${targetCurrency}`,
    startRank: (result.page - 1) * 10 + 1,
    labelFraction: 0.34,
    rows,
  });
}

function buildNavRow(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("sectors_prev")
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId("sectors_next")
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const type = interaction.options.getString("type", true) as SectorType;
  const unowned = interaction.options.getBoolean("unowned") ?? false;
  let page = interaction.options.getInteger("page") ?? 1;
  const targetCurrency = interaction.options.getString("currency") || "USD";

  await interaction.deferReply();

  try {
    let result = await getSectors({ type, unowned, page });

    if (!result.found || result.sectors.length === 0) {
      const message =
        result.mode === "unowned"
          ? `No unowned market remaining for ${result.sectorLabel}.`
          : `No owned sectors found for ${result.sectorLabel}.`;
      await interaction.editReply({ content: message });
      return;
    }

    const rates = await fetchForexRates();

    /**
     * Chart plus embed. The description keeps its hyperlinks to the corporation
     * and state pages on the main site — an image cannot be clicked — and is the
     * text equivalent of the chart.
     */
    const buildReply = () => {
      const unownedMode = result.mode === "unowned";
      const embed = unownedMode
        ? buildUnownedEmbed(result as UnownedSectorsResponse, targetCurrency, rates)
        : buildOwnedEmbed(result as OwnedSectorsResponse, targetCurrency, rates);
      const buffer = unownedMode
        ? buildUnownedChart(result as UnownedSectorsResponse, targetCurrency, rates)
        : buildOwnedChart(result as OwnedSectorsResponse, targetCurrency, rates);
      const chart = chartAttachment(buffer, "sectors", `${result.mode}-${result.page}`);
      embed.setImage(chart.url);
      return { embeds: [embed], files: [chart.file] };
    };

    const totalPages = result.totalPages;

    if (totalPages <= 1) {
      await interaction.editReply(buildReply());
      return;
    }

    const message = await interaction.editReply({
      ...buildReply(),
      components: [buildNavRow(page, totalPages)],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: "Use `/sectors` yourself to browse.", ephemeral: true });
        return;
      }

      await btn.deferUpdate();

      if (btn.customId === "sectors_prev") page = Math.max(1, page - 1);
      if (btn.customId === "sectors_next") page = Math.min(totalPages, page + 1);

      try {
        result = await getSectors({ type, unowned, page });
        await btn.editReply({
          ...buildReply(),
          components: [buildNavRow(page, totalPages)],
        });
      } catch (error) {
        await replyWithError(interaction, "sectors", error);
      }
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  } catch (error) {
    await replyWithError(interaction, "sectors", error);
  }
}
