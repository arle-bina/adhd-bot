import type { AutocompleteInteraction } from "discord.js";
import { autocompleteCharacters, type AutocompleteResult } from "./api.js";

/**
 * Short-lived cache for character autocomplete results.
 * Key: lowercased query string, Value: { results, expiry timestamp }
 *
 * Discord fires autocomplete on every keystroke. Caching recent queries
 * avoids hammering the game API when a user is typing "John" →
 * "j", "jo", "joh", "john" — the first few letters often repeat across
 * invocations from different users too.
 */
const cache = new Map<string, { results: AutocompleteResult[]; expiry: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds
const MAX_CACHE_ENTRIES = 100;

function pruneCache(): void {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiry < now) cache.delete(key);
  }
  // If still too large, drop oldest half
  if (cache.size > MAX_CACHE_ENTRIES) {
    const entries = [...cache.keys()];
    for (let i = 0; i < entries.length / 2; i++) {
      cache.delete(entries[i]);
    }
  }
}

async function getCachedResults(query: string): Promise<AutocompleteResult[]> {
  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) return cached.results;

  const results = await autocompleteCharacters(query, 25);
  pruneCache();
  cache.set(key, { results, expiry: Date.now() + CACHE_TTL_MS });
  return results;
}

/**
 * Shared autocomplete handler for any command with a character name option.
 * Responds with up to 25 matching character names from the game API.
 *
 * @param interaction - The autocomplete interaction
 * @param optionName - The name of the focused option (defaults to whichever is focused)
 */
export async function handleCharacterAutocomplete(
  interaction: AutocompleteInteraction,
  _optionName?: string,
): Promise<void> {
  const focused = interaction.options.getFocused();
  if (!focused || focused.length === 0) {
    await interaction.respond([]);
    return;
  }

  try {
    const results = await getCachedResults(focused);
    await interaction.respond(
      results.slice(0, 25).map((r) => ({ name: r.name, value: r.name }))
    );
  } catch {
    await interaction.respond([]);
  }
}
