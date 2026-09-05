/**
 * AHD chart design tokens.
 *
 * Values are lifted from the game's own `globals.css` default theme so a chart
 * posted in Discord and the same data on ahousedividedgame.com read as one
 * product. Do not introduce ad-hoc hex here — add a token.
 */

/** Surfaces. `page` frames the card; `plot` is the chart surface itself. */
export const SURFACE = {
  page: "#14141c",
  plot: "#1d1d2a",
  elevated: "#26263a",
  border: "#2a2a3d",
} as const;

/** Ink. Text always wears these, never a series colour. */
export const INK = {
  primary: "#e8e8ee",
  secondary: "#b4b4c2",
  muted: "#8f8f9d",
  onSeries: "#14141c",
} as const;

/** Brand accent. Reserved for chrome (the header rule) and single-series emphasis. */
export const BRAND = {
  primary: "#dc2626",
  primaryDark: "#991b1b",
  secondary: "#1d4ed8",
  gold: "#d4af37",
} as const;

/**
 * Status colours. Reserved — never reused as "series N". Each ships with a
 * label or glyph so state is never carried by colour alone.
 */
export const STATUS = {
  good: "#22c55e",
  warning: "#eab308",
  serious: "#f59e0b",
  critical: "#ef4444",
  info: "#3b82f6",
} as const;

/**
 * Categorical series ramp — the fallback identity palette for entities with no
 * brand colour of their own (parties and corporations supply their own).
 *
 * This exact ORDER is the colourblind-safety mechanism, not a cosmetic choice.
 * Validated against surface #1d1d2a in dark mode: lightness band, chroma floor,
 * adjacent CVD separation (worst ΔE 8.4), normal-vision floor (worst ΔE 19.3)
 * and 3:1 contrast all pass. Two "nicer looking" national-hue orderings were
 * tried first and both FAILED the normal-vision floor (ΔE 10.6 and 7.1), so
 * re-run the validator before touching this array:
 *
 *   node scripts/validate_palette.js "<hexes>" --mode dark --surface "#1d1d2a"
 *
 * Assign by fixed slot index, never by rank and never cycled — a filter that
 * changes the series count must not repaint the survivors. Past 8 series, fold
 * the tail into "Others" rather than generating a 9th hue.
 */
export const SERIES = [
  "#3987e5", // 1 blue
  "#d95926", // 2 orange
  "#199e70", // 3 aqua
  "#c98500", // 4 gold
  "#d55181", // 5 magenta
  "#008300", // 6 green
  "#9085e9", // 7 violet
  "#e66767", // 8 red
] as const;

/** Neutral slot for aggregated remainder slices. Deliberately outside SERIES. */
export const OTHERS = "#4a4a5c";
/** Neutral slot for "no owner" / unclaimed magnitude. */
export const UNOWNED = "#33333f";

/** Recessive chart furniture. */
export const AXIS = {
  grid: "rgba(232, 232, 238, 0.07)",
  gridStrong: "rgba(232, 232, 238, 0.12)",
  baseline: "rgba(232, 232, 238, 0.22)",
} as const;

/** Typography. Registered in `fonts.ts`; these are the canvas family names. */
export const FONT = {
  sans: "AHD Geist",
  mono: "AHD JetBrains Mono",
} as const;

/** Type scale, in logical px (the card renders at 2x for retina). */
export const TYPE = {
  title: 19,
  subtitle: 12.5,
  axis: 11,
  label: 11.5,
  value: 12,
  footer: 10.5,
  hero: 34,
} as const;

/** Card geometry, in logical px. */
export const GEO = {
  dpr: 2,
  padX: 20,
  padTop: 18,
  padBottom: 14,
  radius: 10,
  accentRuleW: 3,
  headerGap: 16,
  footerGap: 12,
  plotRadius: 8,
  markSize: 26,
} as const;

/** Assign the fixed categorical slot for series index `i`. Never cycles past 8. */
export function seriesColor(i: number): string {
  return i < SERIES.length ? SERIES[i] : OTHERS;
}

/**
 * Normalise a brand colour supplied by the game API (party/corp identity),
 * falling back to the fixed categorical slot. Accepts `#rgb`, `#rrggbb` or a
 * bare hex with no leading `#`.
 */
export function brandColor(raw: string | null | undefined, slot: number): string {
  if (!raw) return seriesColor(slot);
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return seriesColor(slot);
  return ensureVisible(hex);
}

/** Relative luminance, per WCAG. */
function luminance(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Lift a party or corporation colour that would be invisible on the chart
 * surface, preserving its hue.
 *
 * Real party colours include near-blacks — the CDU/CSU's #32302e sits at 1.1:1
 * against #1d1d2a and rendered as empty benches. Identity still wins: the hue
 * is untouched and the legend always names the party in text. This only raises
 * lightness far enough for the mark to exist.
 */
export function ensureVisible(hex: string, surface: string = SURFACE.plot, min = 2.2): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  if (contrastRatio(`#${h}`, surface) >= min) return `#${h}`;

  const n = parseInt(h, 16);
  let [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // A pure black has no hue to preserve; give it the neutral slot instead.
  if (r + g + b < 12) return "#7a7a8c";

  for (let i = 0; i < 24; i++) {
    r = Math.min(255, Math.round(r * 1.18 + 6));
    g = Math.min(255, Math.round(g * 1.18 + 6));
    b = Math.min(255, Math.round(b * 1.18 + 6));
    const lifted = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    if (contrastRatio(lifted, surface) >= min) return lifted;
  }
  return "#7a7a8c";
}

/**
 * Convert a party/state ideology axis onto the compass scale.
 *
 * These are two different conventions and mixing them silently mirrors the
 * chart. The game stores party and state positions on **-5..+5 where negative
 * is left** (`src/lib/politicalMetrics/derive/countryLean.ts`), while a
 * character's `policies.economic` / `policies.social` are **-100..100 where
 * positive is left** (see the /profile command's own scale). The compass draws
 * the character convention, so party values need both a rescale and a sign
 * flip. This applies to the social axis too — negative there is progressive.
 */
export function partyAxisToCompass(value: number): number {
  return -(Math.max(-5, Math.min(5, value)) / 5) * 100;
}

/** Semantic colour for a signed change. Always paired with a +/- sign in text. */
export function deltaColor(value: number): string {
  if (value > 0) return STATUS.good;
  if (value < 0) return STATUS.critical;
  return INK.muted;
}

/** Convert `#rrggbb` to `rgba(r, g, b, a)` for fills and glows. */
export function alpha(hex: string, a: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Parse `#rrggbb` to a Discord embed integer, for embed accent colours. */
export function hexToInt(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return parseInt(full, 16);
}
