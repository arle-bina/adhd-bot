import {
  SlashCommandBuilder,
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import {
  getStockChart,
  getStockChartCorpList,
  type CorporationListItem,
} from "../utils/api.js";
import { replyWithError, standardFooter } from "../utils/helpers.js";
import { currencyFor, formatCurrency, formatSharePrice, EXCHANGE_CURRENCY } from "../utils/currency.js";
import {
  generateStockChartMarket,
  generateStockChartCorp,
  type StockChartMetric,
} from "../utils/chartGenerator.js";

// ---------------------------------------------------------------------------
// Corporation list cache for autocomplete (5-minute TTL)
// ---------------------------------------------------------------------------

let cachedCorpList: CorporationListItem[] = [];
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getCorpList(): Promise<CorporationListItem[]> {
  if (Date.now() < cacheExpiry && cachedCorpList.length > 0) return cachedCorpList;
  const list = await getStockChartCorpList();
  cachedCorpList = list;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedCorpList;
}

// ---------------------------------------------------------------------------
// Autocomplete handler
// ---------------------------------------------------------------------------

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  try {
    const list = await getCorpList();
    const filtered = list
      .filter((c) => c.name.toLowerCase().includes(focused))
      .slice(0, 25);
    await interaction.respond(
      filtered.map((c) => ({ name: c.name, value: c.name })),
    );
  } catch {
    await interaction.respond([]);
  }
}

// ---------------------------------------------------------------------------
// Slash command definition
// ---------------------------------------------------------------------------

export const data = new SlashCommandBuilder()
  .setName("stock-chart")
  .setDescription("View stock market or corporation chart history")
  .addStringOption((o) =>
    o
      .setName("corp")
      .setDescription("Corporation name (omit for market-wide view)")
      .setRequired(false)
      .setAutocomplete(true),
  )
  .addStringOption((o) =>
    o
      .setName("country")
      .setDescription("Filter by exchange (market mode only)")
      .setRequired(false)
      .addChoices(
        { name: "United States (NYSE)", value: "us" },
        { name: "United Kingdom (FTSE)", value: "uk" },
        { name: "Japan (Nikkei)", value: "jp" },
        { name: "Canada (TSX)", value: "ca" },
        { name: "Germany (DAX)", value: "de" },
      ),
  )
  .addStringOption((o) =>
    o
      .setName("metric")
      .setDescription("Data metric to chart (default: marketCap for market, sharePrice for corp)")
      .setRequired(false)
      .addChoices(
        { name: "Market Cap", value: "marketCap" },
        { name: "Share Price", value: "sharePrice" },
        { name: "Revenue", value: "revenue" },
        { name: "Income", value: "income" },
      ),
  );

export const cooldown = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { EXCHANGE_LABELS } from "../utils/formatting.js";

function buildTitle(mode: "market" | "corporation", exchange: string, corpName?: string, metric?: StockChartMetric): string {
  if (mode === "corporation" && corpName) {
    const metricLabels: Record<StockChartMetric, string> = {
      sharePrice: "Share Price History",
      marketCap: "Market Cap History",
      revenue: "Revenue History",
      income: "Income History",
    };
    return `${corpName} — ${metricLabels[metric ?? "sharePrice"]}`;
  }
  const label = EXCHANGE_LABELS[exchange] ?? "Stock Market";
  return `${label} — Total Market Cap`;
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const corp = interaction.options.getString("corp") || undefined;
    const country = interaction.options.getString("country") || undefined;
    const metricRaw = interaction.options.getString("metric") as StockChartMetric | null;

    const res = await getStockChart({ corp, country, limit: 100 });

    if (!res.found) {
      await interaction.editReply({ content: corp ? `Corporation "${corp}" not found.` : "No market data available." });
      return;
    }

    if (res.mode === "market") {
      const metric: StockChartMetric = metricRaw ?? "marketCap";
      const title = buildTitle("market", res.exchange, undefined, metric);

      if (res.points.length === 0) {
        await interaction.editReply({ content: "No data points available for this market." });
        return;
      }

      const chartBuffer = await generateStockChartMarket(res, { title, metric });
      const attachment = new AttachmentBuilder(chartBuffer, {
        name: `stock-chart-${res.exchange}-${Date.now()}.png`,
        description: title,
      });

      const latestPoint = res.points[res.points.length - 1];
      const firstPoint = res.points[0];
      const cc = EXCHANGE_CURRENCY[res.exchange] ?? "USD";

      const embed = {
        color: 0x5865F2,
        title,
        image: { url: `attachment://${attachment.name}` },
        fields: [
          {
            name: "Current Market Cap",
            value: formatCurrency(latestPoint.marketCap, cc),
            inline: true,
          },
          {
            name: "Data Points",
            value: `${res.points.length} turns (T${firstPoint.turn}–T${latestPoint.turn})`,
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: standardFooter("Stock Chart"),
      };

      await interaction.editReply({ embeds: [embed], files: [attachment] });
    } else {
      // Corporation mode
      const metric: StockChartMetric = metricRaw ?? "sharePrice";
      const title = buildTitle("corporation", "", res.corporation.name, metric);

      if (res.points.length === 0) {
        await interaction.editReply({ content: `No data points available for ${res.corporation.name}.` });
        return;
      }

      const chartBuffer = await generateStockChartCorp(res, { title, metric });
      const attachment = new AttachmentBuilder(chartBuffer, {
        name: `stock-chart-${res.corporation.name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.png`,
        description: title,
      });

      const latestPoint = res.points[res.points.length - 1];
      const firstPoint = res.points[0];
      const cc = currencyFor(res.corporation.countryId);

      const embed = {
        color: 0x57F287,
        title,
        image: { url: `attachment://${attachment.name}` },
        fields: [
          {
            name: "Share Price",
            value: formatSharePrice(latestPoint.sharePrice, cc),
            inline: true,
          },
          {
            name: "Market Cap",
            value: formatCurrency(latestPoint.marketCap, cc),
            inline: true,
          },
          {
            name: "Data Points",
            value: `${res.points.length} turns (T${firstPoint.turn}–T${latestPoint.turn})`,
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: standardFooter(res.corporation.name),
      };

      await interaction.editReply({ embeds: [embed], files: [attachment] });
    }
  } catch (error) {
    await replyWithError(interaction, "stock-chart", error);
  }
}
