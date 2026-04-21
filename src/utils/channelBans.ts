import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BANS_FILE = join(__dirname, "../../data/channel-bans.json");

interface ChannelBansData {
  // guildId -> list of banned channel IDs
  guilds: Record<string, string[]>;
}

function ensureDataDir() {
  const dataDir = dirname(BANS_FILE);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function load(): ChannelBansData {
  if (!existsSync(BANS_FILE)) {
    return { guilds: {} };
  }
  try {
    const raw = readFileSync(BANS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.guilds) {
      return { guilds: {} };
    }
    return parsed as ChannelBansData;
  } catch {
    return { guilds: {} };
  }
}

function save(data: ChannelBansData): void {
  ensureDataDir();
  writeFileSync(BANS_FILE, JSON.stringify(data, null, 2));
}

export function getBannedChannels(guildId: string): string[] {
  return load().guilds[guildId] ?? [];
}

export function isChannelBanned(guildId: string, channelId: string): boolean {
  return getBannedChannels(guildId).includes(channelId);
}

export function addBannedChannel(guildId: string, channelId: string): boolean {
  const data = load();
  const list = data.guilds[guildId] ?? [];
  if (list.includes(channelId)) return false;
  list.push(channelId);
  data.guilds[guildId] = list;
  save(data);
  return true;
}

export function removeBannedChannel(guildId: string, channelId: string): boolean {
  const data = load();
  const list = data.guilds[guildId] ?? [];
  const index = list.indexOf(channelId);
  if (index === -1) return false;
  list.splice(index, 1);
  data.guilds[guildId] = list;
  save(data);
  return true;
}
