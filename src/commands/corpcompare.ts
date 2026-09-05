import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import {
  getCorporation,
  getCorporationList,
  type CorporationResponse,
  type CorporationData,
  type CorporationFinancials,
} from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";
import {
  formatCurrency,
  formatSharePrice,
  fetchForexRates,
  convertCurrency,
  currencyFor,
  CURRENCY_CHOICES,
} from "../utils/currency.js";
import { renderVersus, renderBarChart, seriesColor, compactMoney, compactNumber, type VersusMetric, type BarRow } from "../utils/viz/index.js";
import { chartAttachment } from "../utils/viz/attach.js";
import { symbolFor } from "../utils/currency.js";

// ---------------------------------------------------------------------------
// Corporation list cache
// ---------------------------------------------------------------------------

let cachedList: Array<{ name: string; value: string }> = [];
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getList(): Promise<Array<{ name: string; value: string }>> {
  if (Date.now() < cacheExpiry && cachedList.length > 0) return cachedList;
  
  try {
    const res = await getCorporationList();
    cachedList = res.corporations.map(corp => ({
      name: corp.name,
      value: corp.name
    }));
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return cachedList;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function percent(n: number | undefined | null): string {
  return ((n ?? 0) * 100).toFixed(1) + "%";
}

function getMetricValue(corp: CorporationData | undefined, financials: CorporationFinancials | undefined, metric: string): number {
  switch (metric) {
    case "marketCap": return corp?.marketCapitalization ?? 0;
    case "revenue": return financials?.totalRevenue ?? 0;
    case "income": return financials?.income ?? 0;
    case "profitMargin": 
      const revenue = financials?.totalRevenue ?? 0;
      const income = financials?.income ?? 0;
      return revenue > 0 ? income / revenue : 0;
    case "sharePrice": return corp?.sharePrice ?? 0;
    case "liquidCapital": return corp?.liquidCapital ?? 0;
    case "sectorCount": return 0; // Would need sectors data
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Comparison metrics
// ---------------------------------------------------------------------------

const METRICS = [
  { id: "marketCap", name: "Market Cap", monetary: true, formatter: (n: number | undefined | null, cc: string) => formatCurrency(n, cc) },
  { id: "revenue", name: "Daily Revenue", monetary: true, formatter: (n: number | undefined | null, cc: string) => formatCurrency(n, cc) },
  { id: "income", name: "Daily Income", monetary: true, formatter: (n: number | undefined | null, cc: string) => formatCurrency(n, cc) },
  { id: "profitMargin", name: "Profit Margin", monetary: false, formatter: (_n: number | undefined | null, _cc: string) => percent(_n) },
  { id: "sharePrice", name: "Share Price", monetary: true, formatter: (n: number | undefined | null, cc: string) => formatSharePrice(n, cc) },
  { id: "liquidCapital", name: "Liquid Capital", monetary: true, formatter: (n: number | undefined | null, cc: string) => formatCurrency(n, cc) },
];

type Convert = (amount: number, corp: CorporationResponse) => number;

/** Metric value in the display currency, ready to chart. */
function chartValue(corp: CorporationResponse, metricId: string, convert: Convert): number {
  const raw = getMetricValue(corp.corporation, corp.financials, metricId);
  const monetary = METRICS.find((m) => m.id === metricId)?.monetary ?? false;
  return monetary ? convert(raw, corp) : raw;
}

/**
 * Two corporations, every metric, diverging from a centre line.
 *
 * Profit margin is a ratio and the rest are money, so each row is scaled to its
 * own pair; a shared axis across those units would be meaningless.
 */
function buildVersusChart(corps: CorporationResponse[], targetCurrency: string, convert: Convert): Buffer | null {
  const [a, b] = corps;
  if (!a?.corporation || !b?.corporation) return null;
  const sym = symbolFor(targetCurrency);

  const metrics: VersusMetric[] = METRICS.map((m) => {
    const left = chartValue(a, m.id, convert);
    const right = chartValue(b, m.id, convert);
    const fmt = (v: number) =>
      m.id === "profitMargin"
        ? `${(v * 100).toFixed(1)}%`
        : m.monetary
          ? compactMoney(v, sym)
          : compactNumber(v);
    return {
      label: m.name,
      left: Math.max(0, left),
      right: Math.max(0, right),
      leftDisplay: fmt(left),
      rightDisplay: fmt(right),
    };
  });

  return renderVersus({
    title: `${a.corporation.name} vs ${b.corporation.name}`,
    subtitle: "Each metric scaled to its own pair",
    footerLeft: `Values ${targetCurrency}`,
    left: {
      name: a.corporation.name,
      detail: [a.corporation.typeLabel || a.corporation.type, a.corporation.headquartersStateName]
        .filter(Boolean)
        .join(" · "),
      color: seriesColor(0),
    },
    right: {
      name: b.corporation.name,
      detail: [b.corporation.typeLabel || b.corporation.type, b.corporation.headquartersStateName]
        .filter(Boolean)
        .join(" · "),
      color: seriesColor(1),
    },
    metrics,
  });
}

/** Three or more corporations: rank them on the primary metric. */
function buildRankedChart(
  corps: CorporationResponse[],
  primaryMetric: string,
  targetCurrency: string,
  convert: Convert,
): Buffer | null {
  const metric = METRICS.find((m) => m.id === primaryMetric);
  if (!metric) return null;
  const sym = symbolFor(targetCurrency);

  const rows: BarRow[] = corps
    .map((corp, i) => {
      const value = chartValue(corp, primaryMetric, convert);
      return {
        label: corp.corporation!.name,
        value: Math.max(0, value),
        color: seriesColor(i),
        primary:
          primaryMetric === "profitMargin"
            ? `${(value * 100).toFixed(1)}%`
            : metric.monetary
              ? compactMoney(value, sym)
              : compactNumber(value),
        tag: corp.corporation!.typeLabel || corp.corporation!.type,
      };
    })
    .sort((x, y) => y.value - x.value);

  return renderBarChart({
    title: `${metric.name} — comparison`,
    subtitle: `${corps.length} corporations`,
    footerLeft: metric.monetary ? `Values ${targetCurrency}` : undefined,
    labelFraction: 0.4,
    rows,
  });
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  
  try {
    const list = await getList();
    const filtered = list
      .filter(c => c.name.toLowerCase().includes(focused))
      .slice(0, 25);
    
    await interaction.respond(filtered);
  } catch {
    await interaction.respond([]);
  }
}

// ---------------------------------------------------------------------------
// Slash command definition
// ---------------------------------------------------------------------------

export const data = new SlashCommandBuilder()
  .setName("corpcompare")
  .setDescription("Compare corporations across financial and operational metrics")
  .addStringOption(o => o
    .setName("corp1")
    .setDescription("First corporation to compare")
    .setRequired(true)
    .setAutocomplete(true))
  .addStringOption(o => o
    .setName("corp2")
    .setDescription("Second corporation to compare")
    .setRequired(true)
    .setAutocomplete(true))
  .addStringOption(o => o
    .setName("corp3")
    .setDescription("Third corporation to compare (optional)")
    .setAutocomplete(true))
  .addStringOption(o => o
    .setName("corp4")
    .setDescription("Fourth corporation to compare (optional)")
    .setAutocomplete(true))
  .addStringOption(o => o
    .setName("metric")
    .setDescription("Primary metric to compare")
    .addChoices(...METRICS.map(m => ({ name: m.name, value: m.id }))))
  .addStringOption(o => o
    .setName("currency")
    .setDescription("Display currency for comparison (default: USD)")
    .setRequired(false)
    .addChoices(...CURRENCY_CHOICES));

export const cooldown = 5;

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const corpNames = [
    interaction.options.getString("corp1", true),
    interaction.options.getString("corp2", true),
    interaction.options.getString("corp3"),
    interaction.options.getString("corp4"),
  ].filter(Boolean) as string[];

  const primaryMetric = interaction.options.getString("metric") || "marketCap";
  const targetCurrency = interaction.options.getString("currency") || "USD";

  try {
    // Fetch all corporations in parallel
    const results = await Promise.allSettled(
      corpNames.map(name => getCorporation(name))
    );

    const validCorps: CorporationResponse[] = [];
    const failedCorps: string[] = [];

    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value.found && result.value.corporation) {
        validCorps.push(result.value);
      } else {
        failedCorps.push(corpNames[index]);
      }
    });

    const rates = await fetchForexRates();

    // Per-corp currency resolver: use the API-provided liquidCurrencyCode (v0.2.6+)
    // falling back to country-based mapping for legacy corps.
    const nativeCurrencyFor = (corp: CorporationResponse): string =>
      corp.corporation?.liquidCurrencyCode || currencyFor(corp.corporation?.countryId ?? "us");

    const convertFromCorp = (amount: number, corp: CorporationResponse) =>
      convertCurrency(amount, nativeCurrencyFor(corp), targetCurrency, rates);

    if (validCorps.length < 2) {
      const errorMsg = failedCorps.length > 0 
        ? `Failed to load: ${failedCorps.join(", ")}. Need at least 2 valid corporations.`
        : "Need at least 2 valid corporations to compare.";
      await interaction.editReply({ content: errorMsg });
      return;
    }

    // Two corporations get the full head-to-head; three get ranked bars on the
    // primary metric, because a diverging pair only has two sides.
    const chartBuffer =
      validCorps.length === 2
        ? buildVersusChart(validCorps, targetCurrency, convertFromCorp)
        : buildRankedChart(validCorps, primaryMetric, targetCurrency, convertFromCorp);
    const chart = chartBuffer
      ? chartAttachment(chartBuffer, "corpcompare", validCorps.map((c) => c.corporation!.id).join("-"))
      : null;

    // Build comparison
    const embed = new EmbedBuilder()
      .setTitle("Corporation Comparison")
      .setColor(0x3b82f6)
      .setFooter({ text: `Values in ${targetCurrency} · ahousedividedgame.com` });

    // Add primary metric comparison
    const primaryMetricData = METRICS.find(m => m.id === primaryMetric);
    if (primaryMetricData) {
      const values = validCorps.map(corp => {
        const raw = getMetricValue(corp.corporation, corp.financials, primaryMetric);
        return primaryMetricData.monetary ? convertFromCorp(raw, corp) : raw;
      });
      const maxValue = Math.max(...values);

      const metricLines = validCorps.map((corp, index) => {
        const value = values[index];
        const isMax = value === maxValue && maxValue > 0;
        const prefix = isMax ? "🏆 " : "";
        return `${prefix}**${corp.corporation!.name}**: ${primaryMetricData.formatter(value, targetCurrency)}`;
      });

      embed.addFields({
        name: `📊 ${primaryMetricData.name}`,
        value: metricLines.join("\n"),
        inline: false,
      });
    }

    // Add corporation type comparison
    const typeLines = validCorps.map(corp => {
      const c = corp.corporation!;
      return `**${c.name}**: ${c.typeLabel || c.type}`;
    });

    embed.addFields({
      name: "🏭 Corporation Types",
      value: typeLines.join("\n"),
      inline: false,
    });

    // Add quick stats table
    const statLines: string[] = [];
    
    METRICS.forEach(metric => {
      if (metric.id !== primaryMetric) {
        const values = validCorps.map(corp => {
          const raw = getMetricValue(corp.corporation, corp.financials, metric.id);
          return metric.monetary ? convertFromCorp(raw, corp) : raw;
        });
        const lineParts = validCorps.map((corp, index) => {
          return `${corp.corporation!.name.slice(0, 10)}: ${metric.formatter(values[index], targetCurrency)}`;
        });

        statLines.push(`**${metric.name}**: ${lineParts.join(" | ")}`);
      }
    });

    if (statLines.length > 0) {
      embed.addFields({
        name: "📈 Quick Stats",
        value: statLines.join("\n"),
        inline: false,
      });
    }

    // Add corporation details
    const details = validCorps.map(corp => {
      const c = corp.corporation!;
      const cvt = (n: number) => convertFromCorp(n, corp);
      return `🏢 **${c.name}**\n` +
             `📍 ${c.headquartersStateName} | 💰 ${formatCurrency(cvt(c.liquidCapital ?? 0), targetCurrency)}\n` +
             `📈 ${formatSharePrice(cvt(c.sharePrice ?? 0), targetCurrency)} | 🏭 ${c.typeLabel || c.type}`;
    });

    embed.addFields({
      name: "🏢 Corporation Details",
      value: details.join("\n\n"),
      inline: false,
    });

    if (chart) embed.setImage(chart.url);
    await interaction.editReply({ embeds: [embed], files: chart ? [chart.file] : [] });

  } catch (error) {
    await replyWithError(interaction, "corpcompare", error);
  }
}