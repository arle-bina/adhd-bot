import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, "..", "..", "data");
const WATCHLIST_FILE = join(DATA_DIR, "watchlists.json");

const MAX_WATCHLIST_SIZE = 10;

/** Maps Discord user ID → array of corporation names */
type WatchlistData = Record<string, string[]>;

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadData(): WatchlistData {
  ensureDataDir();
  if (!existsSync(WATCHLIST_FILE)) {
    return {};
  }
  try {
    const raw = readFileSync(WATCHLIST_FILE, "utf-8");
    return JSON.parse(raw) as WatchlistData;
  } catch {
    return {};
  }
}

function saveData(data: WatchlistData): void {
  ensureDataDir();
  writeFileSync(WATCHLIST_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/** Get a user's watchlist (empty array if none). */
export function getWatchlist(userId: string): string[] {
  const data = loadData();
  return data[userId] ?? [];
}

/** Add a corporation to a user's watchlist. Returns true if added, false if already present or full. */
export function addToWatchlist(userId: string, corpName: string): { added: boolean; reason?: string } {
  const data = loadData();
  const list = data[userId] ?? [];

  if (list.some((name) => name.toLowerCase() === corpName.toLowerCase())) {
    return { added: false, reason: `**${corpName}** is already on your watchlist.` };
  }
  if (list.length >= MAX_WATCHLIST_SIZE) {
    return { added: false, reason: `Watchlist is full (max ${MAX_WATCHLIST_SIZE}). Remove one first.` };
  }

  list.push(corpName);
  data[userId] = list;
  saveData(data);
  return { added: true };
}

/** Remove a corporation from a user's watchlist. Returns true if removed. */
export function removeFromWatchlist(userId: string, corpName: string): boolean {
  const data = loadData();
  const list = data[userId] ?? [];
  const idx = list.findIndex((name) => name.toLowerCase() === corpName.toLowerCase());
  if (idx === -1) return false;

  list.splice(idx, 1);
  data[userId] = list;
  saveData(data);
  return true;
}
