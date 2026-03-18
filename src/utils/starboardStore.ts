import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, "..", "..", "data");
const STARBOARD_FILE = join(DATA_DIR, "starboard.json");

export interface StarboardConfig {
  /** Channel ID where starred messages are reposted */
  channelId: string;
  /** Emoji to track (default: "⭐") */
  emoji: string;
  /** Minimum reactions to qualify (default: 3) */
  threshold: number;
  /** Whether the message author's own reaction counts (default: false) */
  selfStar: boolean;
  /** Whether the starboard is active */
  enabled: boolean;
}

interface StarboardData {
  /** Guild configs keyed by guild ID */
  configs: Record<string, StarboardConfig>;
  /** Maps original message ID → starboard post message ID, keyed by guild ID */
  posts: Record<string, Record<string, string>>;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadData(): StarboardData {
  ensureDataDir();
  if (!existsSync(STARBOARD_FILE)) {
    return { configs: {}, posts: {} };
  }
  try {
    const raw = readFileSync(STARBOARD_FILE, "utf-8");
    return JSON.parse(raw) as StarboardData;
  } catch {
    return { configs: {}, posts: {} };
  }
}

function saveData(data: StarboardData): void {
  ensureDataDir();
  writeFileSync(STARBOARD_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/** Get the starboard config for a guild, or null if not configured. */
export function getConfig(guildId: string): StarboardConfig | null {
  const data = loadData();
  return data.configs[guildId] ?? null;
}

/** Save or update the starboard config for a guild. */
export function setConfig(guildId: string, config: StarboardConfig): void {
  const data = loadData();
  data.configs[guildId] = config;
  saveData(data);
}

/** Get the starboard post message ID for an original message, or null. */
export function getStarboardPostId(guildId: string, originalMessageId: string): string | null {
  const data = loadData();
  return data.posts[guildId]?.[originalMessageId] ?? null;
}

/** Save the mapping from original message ID to starboard post message ID. */
export function setStarboardPostId(guildId: string, originalMessageId: string, starboardMessageId: string): void {
  const data = loadData();
  if (!data.posts[guildId]) {
    data.posts[guildId] = {};
  }
  data.posts[guildId][originalMessageId] = starboardMessageId;
  saveData(data);
}

/** Remove a starboard post mapping (e.g. when stars drop below threshold). */
export function removeStarboardPostId(guildId: string, originalMessageId: string): void {
  const data = loadData();
  if (data.posts[guildId]) {
    delete data.posts[guildId][originalMessageId];
    saveData(data);
  }
}
