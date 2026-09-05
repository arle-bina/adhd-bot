import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { getMarketData } from "../utils/api.js";
import { errorMessage } from "../utils/helpers.js";

/** "12 Mar" — full dates make an unreadable x axis at 30+ points. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? String(iso).slice(0, 6)
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
import { EXCHANGE_CURRENCY, symbolFor } from "../utils/currency.js";
import { renderCandles, renderPriceWithVolume } from "../utils/viz/index.js";
import { chartAttachment } from "../utils/viz/attach.js";

export const data = new SlashCommandBuilder()
    .setName("market")
    .setDescription("View stock market charts with historical data")
    .addStringOption((option) =>
      option
        .setName("country")
        .setDescription("Market to view (default: global)")
        .setRequired(false)
        .addChoices(
          { name: "Global", value: "global" },
          { name: "United States (NYSE)", value: "us" },
          { name: "United Kingdom (FTSE)", value: "uk" },
          { name: "Germany (DAX)", value: "de" },
          { name: "Japan (Nikkei)", value: "jp" },
          { name: "Ireland (ISEQ)", value: "ie" },
          { name: "Brazil (B3)", value: "br" },
          { name: "China (SSE)", value: "cn" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("chart")
        .setDescription("Chart type (default: line)")
        .setRequired(false)
        .addChoices(
          { name: "Line Chart", value: "line" },
          { name: "Candle Chart", value: "candle" }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("days")
        .setDescription("Days of history (default: 30, max: 90)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(90)
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    try {
      const country = interaction.options.getString("country") || "global";
      const chartType = interaction.options.getString("chart") || "line";
      const days = interaction.options.getInteger("days") || 30;

      // Normalize country codes
      const exchangeMap: Record<string, string> = {
        global: "global",
        us: "nyse",
        uk: "ftse",
        de: "dax",
        jp: "nikkei",
        ie: "iseq",
        br: "b3",
        cn: "sse"
      };

      const exchange = exchangeMap[country] || "global";

      // Fetch market data
      const marketData = await getMarketData({
        exchange,
        days,
        chartType
      });

      if (!marketData.found || !marketData.history || marketData.history.length === 0) {
        await interaction.editReply("No market data available. Try again later.");
        return;
      }

      const history = marketData.history;
      const labels = history.map((point) => shortDate(point.date));
      const symbol = symbolFor(EXCHANGE_CURRENCY[exchange] ?? "USD");

      // Price and volume get their own panels. The old line chart put them on
      // two y-axes in one frame, which makes any two series look correlated.
      const chartBuffer =
        chartType === "candle"
          ? renderCandles({
              title: marketData.exchangeName,
              subtitle: `Open/high/low/close · last ${days} days`,
              footerLeft: `Turn ${marketData.currentTurn}`,
              candles: history.map((p) => ({
                label: shortDate(p.date),
                open: p.open,
                high: p.high,
                low: p.low,
                close: p.close,
              })),
              currencySymbol: symbol,
            })
          : renderPriceWithVolume({
              title: marketData.exchangeName,
              subtitle: `Close price · last ${days} days`,
              footerLeft: `Turn ${marketData.currentTurn}`,
              labels,
              price: history.map((p) => p.close),
              volume: history.map((p) => p.volume),
              currencySymbol: symbol,
            });

      const chart = chartAttachment(chartBuffer, `market-${exchange}`, chartType);
      const attachment = chart.file;

      const embed = {
        color: 0x5865F2,
        title: `${marketData.exchangeName}`,
        description: `${chartType === "candle" ? "Candlestick" : "Line"} chart • Last ${days} days`,
        image: {
          url: chart.url
        },
        fields: [
          {
            name: "Current Turn",
            value: marketData.currentTurn.toString(),
            inline: true
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: `Market Data • ${marketData.exchangeName} • ${EXCHANGE_CURRENCY[exchange] ?? "USD"}`
        }
      };

      await interaction.editReply({
        embeds: [embed],
        files: [attachment]
      });

    } catch (error) {
      console.error("Market command error:", error);
      await interaction.editReply({
        content: errorMessage("Failed to fetch market data"),
        embeds: []
      });
    }
  }
