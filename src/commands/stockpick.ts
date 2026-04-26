import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  getStockExchange,
  getCorporation,
  type StockListing,
  type CorporationResponse,
} from "../utils/api.js";
import { replyWithError } from "../utils/helpers.js";
import {
  formatCurrency,
  formatSharePrice,
  fetchForexRates,
  convertCurrency,
  currencyFor,
  CURRENCY_CHOICES,
} from "../utils/currency.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoredPick {
  name: string;
  corpUrl: string | null;
  countryId: string | undefined;
  liquidCurrencyCode: string | null;
  sharePrice: number;
  priceChange24h: number;
  income: number;
  marketCap: number;
  publicFloat: number;
  publicFloatPct: number;
  debtToEquity: number | null;
  score: number;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scorePick(
  listing: StockListing,
  corp: CorporationResponse,
): ScoredPick | null {
  const c = corp.corporation;
  if (!c || c.publicFloat <= 0) return null;

  const bs = corp.balanceSheet;
  let debtToEquity: number | null = null;
  if (bs) {
    debtToEquity =
      bs.totalEquity > 0
        ? bs.totalDebt / bs.totalEquity
        : bs.totalDebt > 0
          ? Infinity
          : 0;
  }

  // --- Score components (higher = better) ---
  let score = 0;

  // Positive income is good (scaled)
  const income = corp.financials?.income ?? listing.income;
  if (income > 0) score += 30;
  else if (income === 0) score += 10;

  // Low D/E is good
  if (debtToEquity !== null && debtToEquity !== Infinity) {
    if (debtToEquity <= 0.5) score += 25;
    else if (debtToEquity <= 1.0) score += 15;
    else if (debtToEquity <= 2.0) score += 5;
  } else if (debtToEquity === Infinity) {
    score -= 10;
  }

  // Positive or neutral 24h price change
  if (listing.priceChange24h > 0) score += 20;
  else if (listing.priceChange24h >= -2) score += 10;

  // Higher market cap = more stable
  if (listing.marketCap >= 100_000) score += 15;
  else if (listing.marketCap >= 10_000) score += 10;

  // Larger public float = more liquid
  if (c.publicFloatPct >= 30) score += 10;
  else if (c.publicFloatPct >= 10) score += 5;

  return {
    name: listing.name,
    corpUrl: corp.corporation?.corpUrl ?? null,
    countryId: corp.corporation?.countryId,
    liquidCurrencyCode: corp.corporation?.liquidCurrencyCode ?? listing.liquidCurrencyCode ?? null,
    sharePrice: listing.sharePrice,
    priceChange24h: listing.priceChange24h,
    income,
    marketCap: listing.marketCap,
    publicFloat: c.publicFloat,
    publicFloatPct: c.publicFloatPct,
    debtToEquity,
    score,
  };
}

// ---------------------------------------------------------------------------
// Embed builder
// ---------------------------------------------------------------------------

function buildPicksEmbed(picks: ScoredPick[], total: number, targetCurrency: string, rates: Record<string, number>): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("Stock Picks")
    .setDescription(
      `Top publicly traded stocks with available float, ranked by fundamentals.\nScanned **${total}** listings.`,
    )
    .setColor(0x22c55e)
    .setFooter({ text: `Values in ${targetCurrency} · ahousedividedgame.com` })
    .setTimestamp();

  for (const p of picks) {
    const changeSign = p.priceChange24h >= 0 ? "+" : "";
    const deStr =
      p.debtToEquity === null
        ? "N/A"
        : p.debtToEquity === Infinity
          ? "No equity"
          : p.debtToEquity.toFixed(2);

    // Each listing's native currency. Fall back to country-based mapping, then USD.
    const listingCc = p.liquidCurrencyCode || (p.countryId ? currencyFor(p.countryId) : "USD");
    const spConverted = convertCurrency(p.sharePrice, listingCc, targetCurrency, rates);
    const incConverted = convertCurrency(p.income, listingCc, targetCurrency, rates);
    const mcConverted = convertCurrency(p.marketCap, listingCc, targetCurrency, rates);

    const value = [
      p.corpUrl ? `[${p.name}](${p.corpUrl})` : p.name,
      `Price: **${formatSharePrice(spConverted, targetCurrency)}** (${changeSign}${p.priceChange24h.toFixed(1)}%)`,
      `Income: ${formatCurrency(incConverted, targetCurrency)} · Mkt Cap: ${formatCurrency(mcConverted, targetCurrency)}`,
      `Float: ${p.publicFloat.toLocaleString("en-US")} (${p.publicFloatPct.toFixed(1)}%) · D/E: ${deStr}`,
      `Score: ${p.score}/100`,
    ].join("\n");

    embed.addFields({ name: "\u200b", value: value.slice(0, 1024) });
  }

  if (picks.length === 0) {
    embed.setDescription("No stocks with a public float matched the criteria.");
  }

  return embed;
}

// ---------------------------------------------------------------------------
// Slash command definition
// ---------------------------------------------------------------------------

export const data = new SlashCommandBuilder()
  .setName("stockpick")
  .setDescription("Recommend in-game stocks with a public float")
  .addIntegerOption((o) =>
    o
      .setName("limit")
      .setDescription("Number of picks to show (default 5, max 10)")
      .setMinValue(1)
      .setMaxValue(10)
      .setRequired(false),
  )
  .addStringOption((o) =>
    o
      .setName("currency")
      .setDescription("Display currency (default: USD)")
      .setRequired(false)
      .addChoices(...CURRENCY_CHOICES),
  );

export const cooldown = 10;

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

const MAX_CONCURRENT = 5;

async function fetchCorporationsBatched(
  names: string[],
): Promise<Map<string, CorporationResponse>> {
  const results = new Map<string, CorporationResponse>();

  for (let i = 0; i < names.length; i += MAX_CONCURRENT) {
    const batch = names.slice(i, i + MAX_CONCURRENT);
    const settled = await Promise.allSettled(
      batch.map((n) => getCorporation(n)),
    );
    for (let j = 0; j < batch.length; j++) {
      const result = settled[j];
      if (result.status === "fulfilled" && result.value.found) {
        results.set(batch[j], result.value);
      }
    }
  }

  return results;
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply();

  const limit = Math.min(interaction.options.getInteger("limit") ?? 5, 10);
  const targetCurrency = interaction.options.getString("currency") || "USD";

  try {
    const exchange = await getStockExchange("global");
    const listings = exchange.listings ?? [];

    if (listings.length === 0) {
      await interaction.editReply({ content: "No stock listings found." });
      return;
    }

    // Pre-filter: only consider listings with positive market cap
    const candidates = listings
      .filter((l) => l.marketCap > 0)
      .sort((a, b) => b.marketCap - a.marketCap);

    // Fetch corporation details in batches
    const names = candidates.map((l) => l.name);
    const corpMap = await fetchCorporationsBatched(names);

    // Score and rank
    const picks: ScoredPick[] = [];
    for (const listing of candidates) {
      const corp = corpMap.get(listing.name);
      if (!corp) continue;
      const pick = scorePick(listing, corp);
      if (pick) picks.push(pick);
    }

    picks.sort((a, b) => b.score - a.score || b.marketCap - a.marketCap);

    const topPicks = picks.slice(0, limit);
    const rates = await fetchForexRates();
    const embed = buildPicksEmbed(topPicks, listings.length, targetCurrency, rates);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "stockpick", error);
  }
}