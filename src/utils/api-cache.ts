// TTL response cache + in-flight dedup for idempotent GETs to the game API.
//
// Policy is an explicit allowlist: an endpoint that is not listed is never
// cached. Per-user lookups (a discordId param) are capped at USER_TTL_MS, and
// mutation-adjacent or queue-like endpoints are denied outright.

const SEC = 1000;
const USER_TTL_MS = 30 * SEC;
const MAX_ENTRIES = 500;

/** Path prefixes that must never be cached, even if they also match an allow rule. */
const DENY_PREFIXES = [
  "/api/discord-bot/sync-roles",
  "/api/discord-bot/password-resets",
  "/api/discord-bot/broadcast-dms",
  "/api/discord-bot/blackjack",
  "/api/discord-bot/casino",
  "/api/discord-bot/channel-config",
  "/api/discord-bot/ticket",
  "/api/tickets",
  "/api/ops",
];

/** Longest-prefix-wins TTLs in milliseconds. */
const ALLOW_TTLS: Array<[string, number]> = [
  ["/api/game/turn/status", 15 * SEC],
  ["/api/discord-bot/autocomplete", 60 * SEC],
  ["/api/discord-bot/leaderboard", 60 * SEC],
  ["/api/discord-bot/party", 60 * SEC],
  ["/api/discord-bot/state", 60 * SEC],
  ["/api/discord-bot/government", 60 * SEC],
  ["/api/discord-bot/elections", 60 * SEC],
  ["/api/discord-bot/race", 60 * SEC],
  ["/api/discord-bot/predict", 60 * SEC],
  ["/api/discord-bot/news", 60 * SEC],
  ["/api/discord-bot/sectors", 60 * SEC],
  ["/api/discord-bot/marketshare", 60 * SEC],
  ["/api/discord-bot/stock-chart", 60 * SEC],
  ["/api/discord-bot/bonds", 60 * SEC],
  ["/api/discord-bot/financials", 60 * SEC],
  ["/api/discord-bot/corporation", 60 * SEC],
  ["/api/discord-bot/lookup", 60 * SEC],
  ["/api/discord-bot/career", 60 * SEC],
  ["/api/discord-bot/achievements", 60 * SEC],
  ["/api/discord-bot/supporters", 60 * SEC],
  ["/api/stock-exchange", 60 * SEC],
  ["/api/forex", 120 * SEC],
];

/** TTL in ms for a GET, or 0 when the response must not be cached. */
export function ttlFor(pathname: string, params?: Record<string, string>): number {
  if (DENY_PREFIXES.some((p) => pathname.startsWith(p))) return 0;

  let best = 0;
  let bestLen = -1;
  for (const [prefix, ttl] of ALLOW_TTLS) {
    if (pathname.startsWith(prefix) && prefix.length > bestLen) {
      best = ttl;
      bestLen = prefix.length;
    }
  }
  if (best === 0) return 0;

  // The corporation list is large and slow-moving.
  if (pathname.startsWith("/api/discord-bot/corporation") && params?.list === "true") return 120 * SEC;

  if (params && "discordId" in params) return Math.min(best, USER_TTL_MS);
  return best;
}

interface Entry<T = unknown> {
  expires: number;
  value: Promise<T>;
}

const store = new Map<string, Entry>();

function keyFor(authed: boolean, pathname: string, params?: Record<string, string>): string {
  const q = params
    ? Object.entries(params).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("&")
    : "";
  return `${authed ? "a" : "p"}:${pathname}?${q}`;
}

function evict(now: number): void {
  for (const [k, e] of store) if (e.expires <= now) store.delete(k);
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

function clone<T>(v: T): T {
  return typeof structuredClone === "function" ? structuredClone(v) : v;
}

/**
 * Serve `load()` from cache when the endpoint is cacheable. Concurrent callers
 * for the same key share one in-flight request; failures are never cached.
 * Each caller receives its own copy so commands can mutate results safely.
 */
export async function cachedGet<T>(
  authed: boolean,
  pathname: string,
  params: Record<string, string> | undefined,
  load: () => Promise<T>,
): Promise<T> {
  const ttl = ttlFor(pathname, params);
  if (ttl <= 0) return load();

  const key = keyFor(authed, pathname, params);
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return clone(await (hit.value as Promise<T>));

  evict(now);
  const value = load();
  const entry: Entry<T> = { expires: now + ttl, value };
  store.set(key, entry);
  value.catch(() => {
    if (store.get(key) === entry) store.delete(key);
  });
  return clone(await value);
}

export const _cacheTesting = {
  clear: () => store.clear(),
  size: () => store.size,
  MAX_ENTRIES,
};
