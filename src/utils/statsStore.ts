import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, "..", "..", "data");
const STATS_FILE = join(DATA_DIR, "server-stats.json");

export interface DailyStats {
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Total messages sent that day */
  messages: number;
  /** Server member count snapshot at end of day */
  members: number;
}

interface StatsData {
  /** Keyed by guild ID */
  guilds: Record<string, DailyStats[]>;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadStats(): StatsData {
  ensureDataDir();
  if (!existsSync(STATS_FILE)) {
    return { guilds: {} };
  }
  try {
    const raw = readFileSync(STATS_FILE, "utf-8");
    return JSON.parse(raw) as StatsData;
  } catch {
    return { guilds: {} };
  }
}

function saveStats(data: StatsData): void {
  ensureDataDir();
  writeFileSync(STATS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getOrCreateToday(guildId: string, data: StatsData): DailyStats {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = [];
  }
  const today = todayKey();
  let entry = data.guilds[guildId].find((d) => d.date === today);
  if (!entry) {
    entry = { date: today, messages: 0, members: 0 };
    data.guilds[guildId].push(entry);
  }
  return entry;
}

/** Increment message count for today */
export function recordMessage(guildId: string): void {
  const data = loadStats();
  const entry = getOrCreateToday(guildId, data);
  entry.messages += 1;
  saveStats(data);
}

/** Snapshot the current member count for today */
export function recordMemberCount(guildId: string, count: number): void {
  const data = loadStats();
  const entry = getOrCreateToday(guildId, data);
  entry.members = count;
  saveStats(data);
}

/** Get stats for a guild within a date range */
export function getStats(
  guildId: string,
  days: number,
): DailyStats[] {
  const data = loadStats();
  const guildStats = data.guilds[guildId] ?? [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return guildStats
    .filter((d) => d.date >= cutoffStr)
    .sort((a, b) => a.date.localeCompare(b.date));
}
