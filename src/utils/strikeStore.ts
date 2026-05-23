import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, "..", "..", "data");
const STRIKE_FILE = join(DATA_DIR, "strikes.json");

export const STRIKE_DURATION_DAYS = 60;
export const STRIKE_THRESHOLD = 4;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface Strike {
  id: string;
  reason: string;
  addedAt: string;
  expiresAt: string;
  addedBy: string;
  addedByTag: string;
}

interface StrikesData {
  // guildId -> userId -> strikes
  guilds: Record<string, Record<string, Strike[]>>;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadData(): StrikesData {
  ensureDataDir();
  if (!existsSync(STRIKE_FILE)) {
    return { guilds: {} };
  }
  try {
    const raw = readFileSync(STRIKE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.guilds) {
      return { guilds: {} };
    }
    return parsed as StrikesData;
  } catch {
    return { guilds: {} };
  }
}

function saveData(data: StrikesData): void {
  ensureDataDir();
  writeFileSync(STRIKE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function isActive(strike: Strike, now: number): boolean {
  return new Date(strike.expiresAt).getTime() > now;
}

/** Get the active (non-expired) strikes for a user. */
export function getActiveStrikes(guildId: string, userId: string): Strike[] {
  // Don't prune on read — the hourly sweep owns deletion so it can collect
  // the expired strikes and DM the affected users. Filtering by isActive here
  // keeps stale rows invisible until that sweep runs.
  const data = loadData();
  const strikes = data.guilds[guildId]?.[userId] ?? [];
  const now = Date.now();
  return strikes.filter((s) => isActive(s, now));
}

export interface UserStrikeSummary {
  userId: string;
  strikes: Strike[];
}

/** All users in the guild with at least one active strike, sorted by count desc. */
export function listUsersWithStrikes(guildId: string): UserStrikeSummary[] {
  const data = loadData();
  const users = data.guilds[guildId];
  if (!users) return [];
  const now = Date.now();
  const result: UserStrikeSummary[] = [];
  for (const [userId, strikes] of Object.entries(users)) {
    const active = strikes.filter((s) => isActive(s, now));
    if (active.length > 0) result.push({ userId, strikes: active });
  }
  result.sort((a, b) => b.strikes.length - a.strikes.length);
  return result;
}

export interface AddStrikeResult {
  strike: Strike;
  activeCount: number;
  reachedThreshold: boolean;
}

export function addStrike(
  guildId: string,
  userId: string,
  reason: string,
  addedBy: string,
  addedByTag: string,
): AddStrikeResult {
  const data = loadData();
  if (!data.guilds[guildId]) data.guilds[guildId] = {};
  if (!data.guilds[guildId][userId]) data.guilds[guildId][userId] = [];

  // Drop expired strikes first so the count reflects what's actually active.
  const now = Date.now();
  data.guilds[guildId][userId] = data.guilds[guildId][userId].filter((s) =>
    isActive(s, now),
  );

  const addedAt = new Date(now);
  const expiresAt = new Date(now + STRIKE_DURATION_DAYS * MS_PER_DAY);
  const strike: Strike = {
    id: randomBytes(3).toString("hex"),
    reason: reason.slice(0, 500),
    addedAt: addedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    addedBy,
    addedByTag,
  };
  data.guilds[guildId][userId].push(strike);

  const activeCount = data.guilds[guildId][userId].length;
  saveData(data);

  return {
    strike,
    activeCount,
    reachedThreshold: activeCount >= STRIKE_THRESHOLD,
  };
}

/** Remove a single strike by ID. Returns the removed strike or null. */
export function removeStrike(
  guildId: string,
  userId: string,
  strikeId: string,
): Strike | null {
  const data = loadData();
  const list = data.guilds[guildId]?.[userId];
  if (!list) return null;
  const idx = list.findIndex((s) => s.id === strikeId);
  if (idx === -1) return null;
  const [removed] = list.splice(idx, 1);
  if (list.length === 0) delete data.guilds[guildId][userId];
  saveData(data);
  return removed;
}

/** Remove every strike for a user (active and otherwise). Returns count cleared. */
export function clearStrikes(guildId: string, userId: string): number {
  const data = loadData();
  const list = data.guilds[guildId]?.[userId];
  if (!list || list.length === 0) return 0;
  const count = list.length;
  delete data.guilds[guildId][userId];
  saveData(data);
  return count;
}

export interface ExpiredStrike {
  guildId: string;
  userId: string;
  strike: Strike;
  remainingActive: number;
}

/**
 * Drop expired strikes across every guild and return the ones that were
 * removed so callers can notify affected users.
 */
export function pruneAllExpired(): ExpiredStrike[] {
  const data = loadData();
  const expired: ExpiredStrike[] = [];
  const now = Date.now();
  let mutated = false;
  for (const guildId of Object.keys(data.guilds)) {
    const users = data.guilds[guildId];
    for (const userId of Object.keys(users)) {
      const before = users[userId];
      const kept: Strike[] = [];
      const removed: Strike[] = [];
      for (const strike of before) {
        if (isActive(strike, now)) kept.push(strike);
        else removed.push(strike);
      }
      if (removed.length > 0) {
        mutated = true;
        users[userId] = kept;
        for (const strike of removed) {
          expired.push({ guildId, userId, strike, remainingActive: kept.length });
        }
        if (kept.length === 0) delete users[userId];
      }
    }
  }
  if (mutated) saveData(data);
  return expired;
}
