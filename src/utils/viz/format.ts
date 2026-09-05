/**
 * Number formatting for chart labels.
 *
 * Charts are read at a glance, so axis and value labels are short and
 * consistently rounded. Precision belongs in the embed text, not on the plot.
 */

/** `$1.61B`, `$946.4M`, `$27.1K`, `$42.30`. Negatives keep the sign outside. */
export function compactMoney(value: number, symbol = "$"): string {
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(value);
  if (v >= 1e12) return `${sign}${symbol}${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${sign}${symbol}${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}${symbol}${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${sign}${symbol}${(v / 1e3).toFixed(1)}K`;
  return `${sign}${symbol}${v.toFixed(2)}`;
}

/** `1.61B`, `946.4M`, `27.1K`, `412`. */
export function compactNumber(value: number): string {
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(value);
  if (v >= 1e9) return `${sign}${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${sign}${(v / 1e3).toFixed(1)}K`;
  return `${sign}${Math.round(v).toLocaleString("en-US")}`;
}

/** `+4.2%` / `-1.8%` — always signed, so direction never rests on colour alone. */
export function signedPercent(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export type ValueFormat = "money" | "number" | "percent";

export function formatValue(value: number, format: ValueFormat, symbol = "$"): string {
  if (format === "money") return compactMoney(value, symbol);
  if (format === "percent") return signedPercent(value);
  return compactNumber(value);
}

/**
 * Pick ~`target` evenly spaced tick indices from `count` items, always
 * including the first and last so the axis is anchored at both ends.
 */
export function tickIndices(count: number, target: number): number[] {
  if (count <= 0) return [];
  if (count <= target) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (target - 1);
  const out = new Set<number>();
  for (let i = 0; i < target; i++) out.add(Math.round(i * step));
  out.add(count - 1);
  return [...out].sort((a, b) => a - b);
}

/**
 * A "nice" axis scale: rounded bounds and a step that lands on 1/2/2.5/5×10ⁿ,
 * so gridline labels read as round numbers rather than raw data extremes.
 */
export function niceScale(min: number, max: number, ticks = 5): { min: number; max: number; step: number } {
  if (!isFinite(min) || !isFinite(max) || min === max) {
    const pad = Math.abs(max || 1) * 0.1 || 1;
    return { min: (max || 0) - pad, max: (max || 0) + pad, step: pad };
  }
  const raw = (max - min) / Math.max(1, ticks);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}
