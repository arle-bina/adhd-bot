import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readJsonSafe, writeJsonAtomic } from "./atomicJson.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let prefsFile = join(__dirname, "..", "..", "data", "user-prefs.json");

/** Test seam: point the store at a temp file and drop the in-memory cache. */
export function __setPrefsFileForTests(file: string): void {
  prefsFile = file;
  cache = null;
}

export type NumberFormat = "compact" | "full";

/** Fixed accent palette. Keys are what gets stored; values are embed colours. */
export const ACCENT_PALETTE = {
  blurple: { label: "Blurple", color: 0x5865f2 },
  red: { label: "Red", color: 0xe74c3c },
  blue: { label: "Blue", color: 0x3498db },
  green: { label: "Green", color: 0x2ecc71 },
  gold: { label: "Gold", color: 0xf1c40f },
  orange: { label: "Orange", color: 0xe67e22 },
  purple: { label: "Purple", color: 0x9b59b6 },
  teal: { label: "Teal", color: 0x1abc9c },
  grey: { label: "Grey", color: 0x95a5a6 },
} as const;

export type AccentKey = keyof typeof ACCENT_PALETTE;

export function isAccentKey(v: unknown): v is AccentKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ACCENT_PALETTE, v);
}

export const MAX_FOLLOWS = 25;

export type Follow =
  | { kind: "politician"; name: string }
  | { kind: "party"; id: string; country: string };

export interface UserPrefs {
  defaultCountry: string | null;
  defaultPolitician: string | null;
  /** Replies are ephemeral when true. Default true. */
  privateReplies: boolean;
  numberFormat: NumberFormat;
  accent: AccentKey | null;
  notifyTurn: boolean;
  notifyFollows: boolean;
  follows: Follow[];
}

export const DEFAULT_PREFS: Readonly<UserPrefs> = Object.freeze({
  defaultCountry: null,
  defaultPolitician: null,
  privateReplies: true,
  numberFormat: "compact",
  accent: null,
  notifyTurn: false,
  notifyFollows: false,
  follows: [],
});

interface PrefsData {
  users: Record<string, Partial<UserPrefs>>;
}

let cache: PrefsData | null = null;

function load(): PrefsData {
  if (cache) return cache;
  const raw = readJsonSafe<PrefsData>(prefsFile, { fallback: { users: {} }, onCorrupt: "fallback" });
  cache = raw && typeof raw === "object" && raw.users && typeof raw.users === "object" ? raw : { users: {} };
  return cache;
}

function sanitizeFollows(v: unknown): Follow[] {
  if (!Array.isArray(v)) return [];
  const out: Follow[] = [];
  for (const f of v) {
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    if (o.kind === "politician" && typeof o.name === "string" && o.name) {
      out.push({ kind: "politician", name: o.name });
    } else if (o.kind === "party" && typeof o.id === "string" && typeof o.country === "string") {
      out.push({ kind: "party", id: o.id, country: o.country });
    }
  }
  return out.slice(0, MAX_FOLLOWS);
}

function normalize(p: Partial<UserPrefs> | undefined): UserPrefs {
  const s = p ?? {};
  return {
    defaultCountry: typeof s.defaultCountry === "string" && s.defaultCountry ? s.defaultCountry : null,
    defaultPolitician: typeof s.defaultPolitician === "string" && s.defaultPolitician ? s.defaultPolitician : null,
    privateReplies: typeof s.privateReplies === "boolean" ? s.privateReplies : DEFAULT_PREFS.privateReplies,
    numberFormat: s.numberFormat === "full" ? "full" : "compact",
    accent: isAccentKey(s.accent) ? s.accent : null,
    notifyTurn: s.notifyTurn === true,
    notifyFollows: s.notifyFollows === true,
    follows: sanitizeFollows(s.follows),
  };
}

export function getPrefs(userId: string): UserPrefs {
  return normalize(load().users[userId]);
}

export function updatePrefs(userId: string, patch: Partial<UserPrefs>): UserPrefs {
  const data = load();
  const next = normalize({ ...normalize(data.users[userId]), ...patch });
  data.users[userId] = next;
  writeJsonAtomic(prefsFile, data);
  return next;
}

export function resetPrefs(userId: string): void {
  const data = load();
  if (!(userId in data.users)) return;
  delete data.users[userId];
  writeJsonAtomic(prefsFile, data);
}

function sameFollow(a: Follow, b: Follow): boolean {
  if (a.kind === "politician" && b.kind === "politician") return a.name.toLowerCase() === b.name.toLowerCase();
  if (a.kind === "party" && b.kind === "party") return a.id === b.id && a.country === b.country;
  return false;
}

export type FollowResult = "added" | "exists" | "full";

export function addFollow(userId: string, follow: Follow): FollowResult {
  const cur = getPrefs(userId);
  if (cur.follows.some((f) => sameFollow(f, follow))) return "exists";
  if (cur.follows.length >= MAX_FOLLOWS) return "full";
  updatePrefs(userId, { follows: [...cur.follows, follow] });
  return "added";
}

export function removeFollow(userId: string, follow: Follow): boolean {
  const cur = getPrefs(userId);
  const next = cur.follows.filter((f) => !sameFollow(f, follow));
  if (next.length === cur.follows.length) return false;
  updatePrefs(userId, { follows: next });
  return true;
}

/** All users with the given opt-in, for the notifier. */
export function usersWith(flag: "notifyTurn" | "notifyFollows"): Array<{ userId: string; prefs: UserPrefs }> {
  const out: Array<{ userId: string; prefs: UserPrefs }> = [];
  for (const userId of Object.keys(load().users)) {
    const prefs = getPrefs(userId);
    if (prefs[flag]) out.push({ userId, prefs });
  }
  return out;
}

export interface ResolvedDefaults {
  country: string | undefined;
  politician: string | undefined;
  ephemeral: boolean;
  numberFormat: NumberFormat;
  /** Embed colour from the user palette pick, if any. */
  accentColor: number | undefined;
}

/** One lookup for everything a command needs to honour a user's preferences. */
export function resolveDefaults(userId: string): ResolvedDefaults {
  const p = getPrefs(userId);
  return {
    country: p.defaultCountry ?? undefined,
    politician: p.defaultPolitician ?? undefined,
    ephemeral: p.privateReplies,
    numberFormat: p.numberFormat,
    accentColor: p.accent ? ACCENT_PALETTE[p.accent].color : undefined,
  };
}

/** Explicit option wins, else the user's default country, else undefined. */
export function countryOrDefault(userId: string, explicit: string | null | undefined): string | undefined {
  return explicit || resolveDefaults(userId).country;
}

/** Format a number per the user's preference. */
export function formatNumber(n: number, format: NumberFormat): string {
  if (format === "full") return Math.round(n).toLocaleString("en-US");
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v >= 1e12) return `${sign}${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${sign}${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${sign}${(v / 1e3).toFixed(1)}K`;
  return `${sign}${Math.round(v).toLocaleString("en-US")}`;
}
