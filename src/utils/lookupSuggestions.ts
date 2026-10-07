import { getAutocomplete } from "./api-game.js";
import { suggest } from "./didYouMean.js";

/**
 * "Did you mean" trailer for a state lookup that found nothing. The game only
 * offers substring search, so a typo is retried on shrinking prefixes and the
 * pooled hits are ranked locally. Returns "" on any failure.
 */
export async function stateDidYouMean(input: string): Promise<string> {
  const q = input.trim();
  if (q.length < 2) return "";
  try {
    const pool = new Map<string, string>();
    for (const probe of new Set([q, q.slice(0, 4), q.slice(0, 2)])) {
      const res = await getAutocomplete({ type: "states", q: probe, limit: 25 });
      for (const r of res.results) pool.set(r.id, r.name);
      if (pool.size >= 5) break;
    }
    const labels = [...pool.entries()].map(([id, name]) => ({ id, name }));
    const hits = suggest(q, labels.flatMap((l) => [l.name, l.id]), 6);
    const picked = labels.filter((l) => hits.includes(l.name) || hits.includes(l.id)).slice(0, 3);
    if (picked.length === 0) return "";
    return `\nDid you mean ${picked.map((p) => `${p.name} (\`${p.id}\`)`).join(", ")}?`;
  } catch {
    return "";
  }
}
