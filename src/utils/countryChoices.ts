import type { AutocompleteInteraction } from "discord.js";
import { getAutocomplete } from "./api.js";

export interface CountryChoice {
  id: string;
  name: string;
}

/*
 * Autocomplete fires on every keystroke against a 3s Discord deadline, and the
 * live-country set changes only when an admin flips enablement. Cache the
 * unfiltered list briefly and filter in-process.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; countries: CountryChoice[] } | null = null;

/** Test seam — drops the memoized country list. */
export function __resetCountryCache(): void {
  cache = null;
}

/**
 * The countries enabled in the live game, filtered by the user's typed prefix.
 * Returns [] on API failure so autocomplete degrades to "no suggestions"
 * instead of throwing inside an interaction handler. A failure is not cached,
 * so the next keystroke retries.
 */
export async function fetchLiveCountries(q: string): Promise<CountryChoice[]> {
  const now = Date.now();
  if (!cache || now - cache.at > CACHE_TTL_MS) {
    try {
      const res = await getAutocomplete({ type: "countries", q: "", limit: 25 });
      cache = { at: now, countries: res.results };
    } catch {
      return [];
    }
  }
  const needle = q.trim().toLowerCase();
  if (!needle) return cache.countries;
  return cache.countries.filter(
    (c) => c.name.toLowerCase().includes(needle) || c.id.toLowerCase().startsWith(needle),
  );
}

/** Shared responder for any command whose focused option is a country. */
export async function respondCountryAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused();
  const countries = await fetchLiveCountries(focused);
  await interaction.respond(countries.map((c) => ({ name: c.name, value: c.id })));
}

/**
 * Autocomplete does not constrain submitted values the way `choices` does — a
 * user can type any string — so every command must re-check at execution time.
 * Fails open on a lookup error: a transient API blip should not block commands.
 */
export async function validateCountry(
  code: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!code) return { ok: true };
  const countries = await fetchLiveCountries("");
  if (countries.length === 0) return { ok: true };
  if (countries.some((c) => c.id === code)) return { ok: true };
  return {
    ok: false,
    message: `**${code}** is not part of this game. Pick a country from the suggestions.`,
  };
}
