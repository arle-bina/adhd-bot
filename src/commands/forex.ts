import {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { apiFetchPublic } from "../utils/api-base.js";
import { symbolFor } from "../utils/currency.js";
import { generateForexChart, type ForexRateData } from "../utils/chartGenerator.js";
import { replyWithError, standardFooter } from "../utils/helpers.js";

export const cooldown = 10;

interface ForexExchangeRate {
  countryId: string;
  currencyCode: string;
  rate: number;
  baseRate: number;
  macroTarget: number;
  buyVolume24: number;
  sellVolume24: number;
  rateHistory: Array<{ turn: number; rate: number }>;
}

interface ForexExchangeResponse {
  rates: ForexExchangeRate[];
  orderBook: unknown[];
}

export const data = new SlashCommandBuilder()
  .setName("forex")
  .setDescription("View currency exchange rates and 48-hour performance");

function formatRate(rate: number): string {
  if (rate >= 10) return rate.toFixed(2);
  return rate.toFixed(4);
}

function pctChange(history: Array<{ rate: number }>): string {
  if (history.length < 2) return "N/A";
  const first = history[0].rate;
  const last = history[history.length - 1].rate;
  if (!first) return "N/A";
  const pct = ((last - first) / first) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const res = await apiFetchPublic<ForexExchangeResponse>("/api/forex/exchange");

    if (!res.rates || res.rates.length === 0) {
      await interaction.editReply({ content: "Currency exchange data is not available yet." });
      return;
    }

    // Build rate table
    const header = "Currency  \u2502  Rate/INT  \u2502  48h \u0394";
    const separator = "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500";
    const rows = res.rates.map((r) => {
      const sym = symbolFor(r.currencyCode);
      const label = `${r.currencyCode} (${sym})`.padEnd(9);
      const rate = formatRate(r.rate).padStart(10);
      const change = pctChange(r.rateHistory).padStart(8);
      return `${label} \u2502 ${rate} \u2502 ${change}`;
    });

    const table = `\`\`\`\n${header}\n${separator}\n${rows.join("\n")}\n\`\`\``;

    const embed = new EmbedBuilder()
      .setTitle("Currency Exchange Rates")
      .setColor(0x5865f2)
      .setDescription(table);

    // Volume fields
    for (const r of res.rates) {
      const sym = symbolFor(r.currencyCode);
      embed.addFields({
        name: `${r.currencyCode} (${sym}) Volume`,
        value: `Buy: ${Math.round(r.buyVolume24).toLocaleString()} \u00b7 Sell: ${Math.round(r.sellVolume24).toLocaleString()}`,
        inline: true,
      });
    }

    embed.setFooter(standardFooter("1 INT = listed rate in local currency \u00b7 Updated every turn"));

    // Generate chart
    const chartData: ForexRateData[] = res.rates
      .filter((r) => r.rateHistory.length > 1)
      .map((r) => ({
        currencyCode: r.currencyCode,
        rateHistory: r.rateHistory,
      }));

    if (chartData.length > 0) {
      const chartBuffer = await generateForexChart(chartData);
      const attachment = new AttachmentBuilder(chartBuffer, {
        name: `forex-${Date.now()}.png`,
        description: "Currency performance chart",
      });

      embed.setImage(`attachment://${attachment.name}`);
      await interaction.editReply({ embeds: [embed], files: [attachment] });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    await replyWithError(interaction, "forex", error);
  }
}
