import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILTER_FILE = join(__dirname, "../../data/filter.json");

interface FilterData {
  terms: string[];
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

export function getFilteredTerms(): string[] {
  return loadFilter().terms;
}

export function addFilteredTerm(term: string): boolean {
  const data = loadFilter();
  const normalized = term.toLowerCase().trim();
  if (data.terms.includes(normalized)) {
    return false; // Already exists
  }
  data.terms.push(normalized);
  saveFilter(data);
  return true;
}

export function removeFilteredTerm(term: string): boolean {
  const data = loadFilter();
  const normalized = term.toLowerCase().trim();
  const index = data.terms.indexOf(normalized);
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
 * Returns the matched term or null if no match.
 */
export function checkMessage(content: string): string | null {
  const terms = getFilteredTerms();
  if (terms.length === 0) return null;

  const lower = content.toLowerCase();

  for (const term of terms) {
    // Word boundary match — punctuation around the term still counts as a hit,
    // but the term must not be embedded inside a larger word.
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escapeRegex(term)}(?:[^\\p{L}\\p{N}_]|$)`, "u");
    if (re.test(lower)) {
      return term;
    }
  }
  return null;
}
