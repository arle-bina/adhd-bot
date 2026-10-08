// Pure formatters and parsers for the feature commands. No Discord, no I/O.

export const FEAT_PREFIX = "feat_";

export type CountryTab = "overview" | "economy" | "legislature" | "budget";
export const COUNTRY_TABS: readonly CountryTab[] = ["overview", "economy", "legislature", "budget"];

export const COUNTRY_TAB_LABELS: Record<CountryTab, string> = {
  overview: "Overview",
  economy: "Economy",
  legislature: "Legislature",
  budget: "Budget",
};

export function isCountryTab(value: string): value is CountryTab {
  return (COUNTRY_TABS as readonly string[]).includes(value);
}

/** Compact number with unit suffix: 1.2T, 3.4B, 5.6M, 7.8K. */
export function compact(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(value);
  if (v >= 1e12) return `${sign}${(v / 1e12).toFixed(digits)}T`;
  if (v >= 1e9) return `${sign}${(v / 1e9).toFixed(digits)}B`;
  if (v >= 1e6) return `${sign}${(v / 1e6).toFixed(digits)}M`;
  if (v >= 1e3) return `${sign}${(v / 1e3).toFixed(digits)}K`;
  return `${sign}${v.toFixed(v < 10 && v % 1 !== 0 ? 2 : 0)}`;
}

export function pct(value: number | null | undefined, digits = 1, signed = false): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${signed && value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

/**
 * Unemployment arrives from the metrics endpoint with no declared unit. Treat
 * values at or below 1 as fractions and scale them to a percentage.
 */
export function unemploymentPct(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  return raw <= 1 ? raw * 100 : raw;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

/** `food` / `building_materials` -> `Building materials`. */
export function humanize(key: string): string {
  const s = key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function unixSeconds(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

export function discordTime(iso: string | null | undefined, style: "R" | "f" | "t" = "R"): string {
  const s = unixSeconds(iso);
  return s == null ? "n/a" : `<t:${s}:${style}>`;
}

/** Text progress bar, `[#####-----] 50%`. Clamps out-of-range input. */
export function progressBar(percent: number | null | undefined, width = 12): string {
  const p = Math.min(100, Math.max(0, Number.isFinite(percent ?? NaN) ? (percent as number) : 0));
  const filled = Math.round((p / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)} ${Math.round(p)}%`;
}

/** Share as a percent of a total, 0 when the total is 0. */
export function share(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

export function clampPage(page: number, pages: number): number {
  if (!Number.isFinite(page)) return 0;
  return Math.min(Math.max(0, Math.trunc(page)), Math.max(0, pages - 1));
}

/** Parse `AB`/`ab` style country codes. Returns null for anything else. */
export function parseCountryCode(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toUpperCase();
  return /^[A-Z]{2,3}$/.test(s) ? s : null;
}

/** Parse a commodity key, normalising `Building Materials` to `building_materials`. */
export function parseCommodityKey(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return /^[a-z][a-z_]{1,40}$/.test(s) ? s : null;
}

/** Split a `feat_` customId into its kind and args. `feat_country:economy:US` -> country, [economy, US]. */
export function parseFeatId(customId: string): { kind: string; args: string[] } | null {
  if (!customId.startsWith(FEAT_PREFIX)) return null;
  const [head, ...args] = customId.slice(FEAT_PREFIX.length).split(":");
  return head ? { kind: head, args } : null;
}

/** Build a `feat_` customId, optionally with a trailing discriminator. */
export function featId(kind: string, ...args: Array<string | number>): string {
  return `${FEAT_PREFIX}${[kind, ...args].join(":")}`;
}

/** Display a country's leader line. */
export function leaderLine(leader: { name: string | null; party: string | null } | null): string {
  if (!leader || !leader.name) return "Vacant";
  return leader.party ? `${leader.name} (${leader.party})` : leader.name;
}

/** Contested control as "A 62% / B 38%". `control` is Side A's share, 0-100 or 0-1. */
export function controlSplit(control: number): { a: number; b: number } {
  const a = control <= 1 ? control * 100 : control;
  const clamped = Math.min(100, Math.max(0, a));
  return { a: clamped, b: 100 - clamped };
}

export function sideLabel(side: { label: string; countries: string[] }): string {
  const c = side.countries.length ? ` (${side.countries.join(", ")})` : "";
  return `${side.label}${c}`;
}

/** Turn countdown: whole seconds until `iso`, or null when absent/past. */
export function secondsUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const s = Math.ceil((ms - now) / 1000);
  return s > 0 ? s : null;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
