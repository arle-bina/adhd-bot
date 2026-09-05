import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { apiFetchPublic, ApiError } from "../utils/api-base.js";
import { symbolFor } from "../utils/currency.js";
import { renderTimeSeries, SERIES } from "../utils/viz/index.js";
import { chartAttachment } from "../utils/viz/attach.js";
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
  if (!first || !isFinite(first)) return "N/A";
  const pct = ((last - first) / first) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Currency ordering for the chart.
 *
 * Colours are assigned by fixed slot in the validated series ramp, never by
 * rank, so adding or removing a currency never repaints the others. The order
 * is the ramp's own — the previous hand-picked "national hue" palette here
 * (USD steel blue, JPY green, BRL green, CNY red) failed the validator badly:
 * BRL #009C3B against JPY #228833 was ΔE 5.8 in *normal* vision, and CNY
 * against BRL was ΔE 4.0 under deuteranopia.
 */
const CURRENCY_SLOT: Record<string, number> = {
  USD: 0, GBP: 1, EUR: 2, JPY: 3, BRL: 4, CNY: 5, NGN: 6,
};

function slotFor(code: string, fallback: number): number {
  return CURRENCY_SLOT[code] ?? fallback;
}

/** Performance indexed to each currency's first observation in the window. */
function buildForexChart(rates: ForexExchangeRate[]): Buffer | null {
  const usable = rates.filter((r) => r.rateHistory.length > 1);
  if (usable.length === 0) return null;

  const turns = [...new Set(usable.flatMap((r) => r.rateHistory.map((h) => h.turn)))].sort((a, b) => a - b);

  const series = usable
    .map((r, i) => ({ r, slot: slotFor(r.currencyCode, i) }))
    .sort((a, b) => a.slot - b.slot)
    .map(({ r, slot }) => {
      const base = r.rateHistory[0].rate;
      const byTurn = new Map(r.rateHistory.map((h) => [h.turn, h.rate]));

      // Carry the last known rate across turns a currency did not trade in,
      // rather than breaking the line.
      let last = base;
      const values = turns.map((t) => {
        const v = byTurn.get(t);
        if (v != null && isFinite(v)) last = v;
        return !base || !isFinite(base) ? 0 : ((last - base) / base) * 100;
      });

      return { name: `${r.currencyCode} (${symbolFor(r.currencyCode)})`, values, color: SERIES[slot % SERIES.length] };
    });

  return renderTimeSeries({
    title: "Currency performance",
    subtitle: `Change vs. period open · last ${turns.length} turns`,
    footerLeft: "Indexed to each currency's first observation",
    labels: turns.map((t) => `T${t}`),
    series,
    valueFormat: "percent",
    zeroBaseline: true,
  });
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
      const change = pctChange(r.rateHistory).padStart(9);
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

    const chartBuffer = buildForexChart(res.rates);
    if (chartBuffer) {
      const chart = chartAttachment(chartBuffer, "forex");
      embed.setImage(chart.url);
      await interaction.editReply({ embeds: [embed], files: [chart.file] });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      await interaction.editReply({ content: "Currency exchange is currently disabled in the game." });
      return;
    }
    await replyWithError(interaction, "forex", error);
  }
}
