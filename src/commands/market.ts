import { SlashCommandBuilder, AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import { getMarketData } from "../utils/api.js";
import { errorMessage } from "../utils/helpers.js";
import { EXCHANGE_CURRENCY } from "../utils/currency.js";
import { generateLineChart, generateCandleChart } from "../utils/chartGenerator.js";

export default {
  data: new SlashCommandBuilder()
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
          { name: "Japan (Nikkei)", value: "jp" },
          { name: "Canada (TSX)", value: "ca" },
          { name: "Germany (DAX)", value: "de" }
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
    ),

  async execute(interaction: ChatInputCommandInteraction) {
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
        jp: "nikkei",
        ca: "tsx",
        de: "dax"
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

      // Generate chart
      let chartBuffer: Buffer;
      if (chartType === "candle") {
        chartBuffer = await generateCandleChart(marketData, {
          exchange: marketData.exchangeName,
          days
        });
      } else {
        chartBuffer = await generateLineChart(marketData, {
          exchange: marketData.exchangeName,
          days
        });
      }

      const attachment = new AttachmentBuilder(chartBuffer, {
        name: `market-${exchange}-${Date.now()}.png`,
        description: `${marketData.exchangeName} ${chartType} chart`
      });

      const embed = {
        color: 0x5865F2,
        title: `${marketData.exchangeName}`,
        description: `${chartType === "candle" ? "Candlestick" : "Line"} chart • Last ${days} days`,
        image: {
          url: `attachment://${attachment.name}`
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
};