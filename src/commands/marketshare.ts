import {
  SlashCommandBuilder,
  AttachmentBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getMarketShare, SectorType, MarketShareResponse } from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";
import { renderBarChart, brandColor, OTHERS, UNOWNED, compactMoney, type BarRow } from "../utils/viz/index.js";
import { chartAttachment } from "../utils/viz/attach.js";
import { linkList, subtext, meta } from "../utils/embeds.js";
import { respondCountryAutocomplete, validateCountry } from "../utils/countryChoices.js";
import {
  currencyFor,
  formatCurrency,
  fetchForexRates,
  convertCurrency,
  convertAnchorToCurrency,
  symbolFor,
  CURRENCY_CHOICES,
} from "../utils/currency.js";

export const cooldown = 10;

import { COUNTRY_NAMES } from "../utils/formatting.js";

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
  .addStringOption((option) =>
    option
      .setName("country")
      .setDescription("Filter by country")
      .setRequired(false)
      .setAutocomplete(true)
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
  )
  .addStringOption((option) =>
    option
      .setName("currency")
      .setDescription("Display currency (default: auto by country)")
      .setRequired(false)
      .addChoices(...CURRENCY_CHOICES)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await respondCountryAutocomplete(interaction);
}

function buildScopeLabel(result: MarketShareResponse): string {
  if (result.scope.stateName) return result.scope.stateName;
  if (result.scope.country) return COUNTRY_NAMES[result.scope.country] ?? result.scope.country;
  return "Global";
}

/**
 * Ranked bars, one row per corporation.
 *
 * This used to be a QuickChart doughnut URL. Two things were wrong with it:
 * a ring cannot show a ranking past a handful of slices, and the config never
 * arrived intact — `JSON.stringify` drops function values, so the datalabel
 * formatter (which suppressed labels under 3%) was silently stripped, and
 * `options.plugins.legend` is a Chart.js v4 path that QuickChart's default v2
 * renderer ignores, so the legend rendered anyway and swallowed the canvas.
 */
function buildChart(
  result: MarketShareResponse,
  showUnowned: boolean,
  targetCurrency: string,
  rates: Record<string, number>,
): Buffer {
  const rows: BarRow[] = result.companies.map((c, i) => {
    const sourceCurrency = c.liquidCurrencyCode || currencyFor(c.countryId);
    const revenue = convertCurrency(c.revenue, sourceCurrency, targetCurrency, rates);
    return {
      label: c.corporationName,
      value: c.marketSharePercent,
      color: brandColor(c.brandColor, i),
      primary: `${c.marketSharePercent.toFixed(2)}%`,
      secondary: compactMoney(revenue, symbolFor(targetCurrency)),
      tag: c.isNatcorp ? "NatCorp" : undefined,
    };
  });

  // "Others": owned revenue that isn't on this page.
  const pageOwnedPct = result.companies.reduce((s, c) => s + c.marketSharePercent, 0);
  const totalOwnedPct = result.totalMarket > 0 ? (result.totalOwnedRevenue / result.totalMarket) * 100 : 0;
  const othersPct = Math.max(0, totalOwnedPct - pageOwnedPct);
  if (othersPct > 0.01) {
    rows.push({ label: "Others", value: othersPct, color: OTHERS, primary: `${othersPct.toFixed(2)}%` });
  }

  if (showUnowned && result.unownedPercent > 0.01) {
    rows.push({ label: "Unowned", value: result.unownedPercent, color: UNOWNED, primary: `${result.unownedPercent.toFixed(2)}%` });
  }

  const scopeLabel = buildScopeLabel(result);
  const footerParts = [`Values ${targetCurrency}`];
  if (result.totalMarket > 0) {
    const tam = convertAnchorToCurrency(result.totalMarket, targetCurrency, rates);
    footerParts.unshift(`TAM ${compactMoney(tam, symbolFor(targetCurrency))}`);
  }

  return renderBarChart({
    title: `${result.sectorLabel} — ${scopeLabel}`,
    subtitle:
      result.totalPages > 1
        ? `Market share by revenue · page ${result.page} of ${result.totalPages}`
        : "Market share by revenue",
    footerLeft: footerParts.join(" · "),
    startRank: (result.page - 1) * result.pageSize + 1,
    rows,
  });
}

function gameSiteOrigin(): string {
  try {
    return new URL(process.env.GAME_API_URL!).origin;
  } catch {
    return "https://www.ahousedividedgame.com";
  }
}

interface MarketShareReply {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
}

function buildReply(result: MarketShareResponse, showUnowned: boolean, targetCurrency: string, rates: Record<string, number>): MarketShareReply {
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
    /*
     * The chart already ranks every corporation with its share and revenue, so
     * this is a link run rather than a second copy of the same table. It exists
     * for the one thing the image cannot do: click through to a corporation on
     * the main site.
     */
    const leader = result.companies[0];
    const links = linkList(
      result.companies.map((c) => ({
        label: c.corporationName,
        url:
          c.corporationSequentialId != null
            ? new URL(`/corporation/${c.corporationSequentialId}`, gameSiteOrigin()).href
            : null,
        note: c.isNatcorp ? "NatCorp" : undefined,
      })),
    );

    embed.setDescription(
      [
        links,
        subtext(
          meta(
            `Leader ${leader.corporationName} ${leader.marketSharePercent.toFixed(2)}%`,
            `${result.companies.length} shown`,
            `Values ${targetCurrency}`,
          ),
        ),
      ].join("\n"),
    );
  }

  const footerParts: string[] = [];
  if (result.totalPages > 1) {
    footerParts.push(`Page ${result.page}/${result.totalPages}`);
  }
  // totalMarket and totalOwnedRevenue are now in anchor currency (₳=USD) from the API.
  // Convert to the user's chosen display currency.
  if (result.unownedRevenue != null && result.unownedRevenue > 0) {
    const converted = convertAnchorToCurrency(result.unownedRevenue, targetCurrency, rates);
    footerParts.push(`Unowned: ${formatCurrency(converted, targetCurrency)} (${result.unownedPercent.toFixed(2)}%)`);
  } else {
    footerParts.push(`Unowned: ${result.unownedPercent.toFixed(2)}%`);
  }
  if (result.totalMarket > 0) {
    const converted = convertAnchorToCurrency(result.totalMarket, targetCurrency, rates);
    footerParts.push(`TAM: ${formatCurrency(converted, targetCurrency)}`);
  }
  footerParts.push(`Values in ${targetCurrency}`);
  footerParts.push("ahousedividedgame.com");
  embed.setFooter({ text: footerParts.join(" · ") });

  if (result.companies.length === 0) return { embeds: [embed], files: [] };

  // The chart is the scannable view; the description above stays as the text
  // equivalent, which is what a screen reader and a narrow mobile client get.
  const chart = chartAttachment(
    buildChart(result, showUnowned, targetCurrency, rates),
    "marketshare",
    `${result.page}${showUnowned ? "u" : ""}`,
  );
  embed.setImage(chart.url);
  return { embeds: [embed], files: [chart.file] };
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
  const explicitCurrency = interaction.options.getString("currency");

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
    let result = await getMarketShare({ type, country, state, page, discordId: interaction.user.id });

    // Priority: explicit user choice > linked account home currency > country scope > USD
    const targetCurrency =
      explicitCurrency ||
      result.suggestedCurrencyCode ||
      (country ? currencyFor(country) : "USD");

    if (!result.found) {
      await interaction.editReply({ content: "Could not retrieve market share data for that query." });
      return;
    }

    const rates = await fetchForexRates();

    if (result.companies.length === 0 && result.totalPages <= 1) {
      await interaction.editReply(buildReply(result, showUnowned, targetCurrency, rates));
      return;
    }

    const totalPages = result.totalPages;

    const message = await interaction.editReply({
      ...buildReply(result, showUnowned, targetCurrency, rates),
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
          ...buildReply(result, showUnowned, targetCurrency, rates),
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
