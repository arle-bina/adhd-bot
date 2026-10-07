/*
 * Fuzzy "did you mean" suggestions for name lookups that come back empty.
 */

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Lower is better; Infinity means not similar enough to suggest. */
function score(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return Infinity;
  if (c === q) return 0;
  if (c.startsWith(q)) return 1;
  if (c.includes(q) || q.includes(c)) return 2;
  const maxDist = Math.max(1, Math.floor(q.length / 3));
  const whole = editDistance(q, c);
  // Also compare against the closest word, so "aple" finds "Apple Inc".
  const word = Math.min(...c.split(" ").map((w) => editDistance(q, w)));
  const best = Math.min(whole, word);
  return best <= maxDist ? 2 + best : Infinity;
}

/** Up to `limit` candidates ranked by similarity to `query`, best first. */
export function suggest(query: string, candidates: readonly string[], limit = 3): string[] {
  const seen = new Set<string>();
  return candidates
    .map((c) => ({ c, s: score(query, c) }))
    .filter((x) => x.s !== Infinity)
    .sort((a, b) => a.s - b.s || a.c.length - b.c.length)
    .map((x) => x.c)
    .filter((c) => (seen.has(c) ? false : (seen.add(c), true)))
    .slice(0, limit);
}

/** Formatted trailer such as "\nDid you mean `Apex Media`, `Apex Rail`?" or "". */
export function didYouMeanLine(query: string, candidates: readonly string[], limit = 3): string {
  const hits = suggest(query, candidates, limit);
  if (hits.length === 0) return "";
  return `\nDid you mean ${hits.map((h) => `\`${h}\``).join(", ")}?`;
}
