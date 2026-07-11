import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, "..", "..", "data");
const FILE = join(DATA_DIR, "reaction-roles.json");

export interface ReactionRoleBinding {
  guildId: string;
  channelId: string;
  /** The role granted when a user reacts. */
  roleId: string;
  /** Matcher for the reaction: a unicode emoji ("✅") or a custom emoji id. */
  emoji: string;
  /** When true, removing the reaction removes the role. Testers stay opted-in
   *  by default (false), so an accidental un-react does not strip access. */
  removeOnUnreact: boolean;
}

interface StoreData {
  /** Bindings keyed by the reaction-role message id. */
  bindings: Record<string, ReactionRoleBinding>;
}

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function load(): StoreData {
  ensureDir();
  if (!existsSync(FILE)) return { bindings: {} };
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as StoreData;
  } catch {
    return { bindings: {} };
  }
}

function save(data: StoreData): void {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function setBinding(messageId: string, binding: ReactionRoleBinding): void {
  const data = load();
  data.bindings[messageId] = binding;
  save(data);
}

export function getBinding(messageId: string): ReactionRoleBinding | undefined {
  return load().bindings[messageId];
}

export function removeBinding(messageId: string): void {
  const data = load();
  delete data.bindings[messageId];
  save(data);
}

export function listBindings(): Record<string, ReactionRoleBinding> {
  return load().bindings;
}

/** True when a live reaction matches a binding's stored emoji (unicode name,
 *  full unicode string, or a custom emoji id). */
export function emojiMatches(binding: ReactionRoleBinding, emoji: { name: string | null; id: string | null }): boolean {
  const want = binding.emoji;
  return want === emoji.name || want === emoji.id || (emoji.id != null && want === `${emoji.name}:${emoji.id}`);
}
