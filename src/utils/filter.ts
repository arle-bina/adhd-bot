import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILTER_FILE = join(__dirname, "../../data/filter.json");

export interface FilterTerm {
  term: string;
  /** Channel IDs the term applies to. Empty array = applies to all channels. */
  channels: string[];
}

interface FilterData {
  terms: (string | FilterTerm)[];
}

function ensureDataDir() {
  const dataDir = dirname(FILTER_FILE);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function loadFilter(): FilterData {
  if (!existsSync(FILTER_FILE)) {
    return { terms: [] };
  }
  try {
    const raw = readFileSync(FILTER_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { terms: [] };
  }
}

function saveFilter(data: FilterData): void {
  ensureDataDir();
  writeFileSync(FILTER_FILE, JSON.stringify(data, null, 2));
}

/** Normalize stored entries (handles legacy plain-string entries). */
function normalize(entry: string | FilterTerm): FilterTerm {
  if (typeof entry === "string") return { term: entry, channels: [] };
  return { term: entry.term, channels: entry.channels ?? [] };
}

export function getFilteredTerms(): FilterTerm[] {
  return loadFilter().terms.map(normalize);
}

export function addFilteredTerm(term: string, channels: string[] = []): boolean {
  const data = loadFilter();
  const normalized = term.toLowerCase().trim();
  const existing = data.terms.findIndex((e) => normalize(e).term === normalized);
  if (existing !== -1) {
    return false; // Already exists
  }
  data.terms.push({ term: normalized, channels });
  saveFilter(data);
  return true;
}

export function removeFilteredTerm(term: string): boolean {
  const data = loadFilter();
  const normalized = term.toLowerCase().trim();
  const index = data.terms.findIndex((e) => normalize(e).term === normalized);
  if (index === -1) {
    return false; // Doesn't exist
  }
  data.terms.splice(index, 1);
  saveFilter(data);
  return true;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if a message contains any filtered terms (whole-word match, case insensitive,
 * tolerant of surrounding punctuation like "term!" or "term," or "(term)").
 * Terms with `channels` set only trigger in those channels; empty `channels` = all channels.
 * Returns the matched term or null if no match.
 */
export function checkMessage(content: string, channelId?: string): string | null {
  const terms = getFilteredTerms();
  if (terms.length === 0) return null;

  const lower = content.toLowerCase();

  for (const { term, channels } of terms) {
    // Skip if scoped to channels and this isn't one of them
    if (channels.length > 0 && (!channelId || !channels.includes(channelId))) continue;

    // Word boundary match — punctuation around the term still counts as a hit,
    // but the term must not be embedded inside a larger word.
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escapeRegex(term)}(?:[^\\p{L}\\p{N}_]|$)`, "u");
    if (re.test(lower)) {
      return term;
    }
  }
  return null;
}
