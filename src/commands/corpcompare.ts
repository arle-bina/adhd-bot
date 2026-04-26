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

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    await replyWithError(interaction, "corpcompare", error);
  }
}