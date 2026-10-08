import { readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ApplicationCommandOptionType } from "discord.js";

export interface CatalogOption {
  name: string;
  description: string;
  required: boolean;
  type: string;
  choices: string[];
}

export interface CatalogSubcommand {
  name: string;
  description: string;
  options: CatalogOption[];
}

export interface CatalogCommand {
  name: string;
  description: string;
  options: CatalogOption[];
  subcommands: CatalogSubcommand[];
  /** Raw default_member_permissions bitfield string, or null when everyone can see it. */
  requiredPermissions: string | null;
  /** Source file base name (without extension). */
  file: string;
}

interface CommandJson {
  name: string;
  description: string;
  options?: OptionJson[];
  default_member_permissions?: string | null;
}

interface OptionJson {
  type: number;
  name: string;
  description: string;
  required?: boolean;
  choices?: { name: string }[];
  options?: OptionJson[];
}

const TYPE_LABELS: Record<number, string> = {
  [ApplicationCommandOptionType.String]: "text",
  [ApplicationCommandOptionType.Integer]: "whole number",
  [ApplicationCommandOptionType.Number]: "number",
  [ApplicationCommandOptionType.Boolean]: "true/false",
  [ApplicationCommandOptionType.User]: "user",
  [ApplicationCommandOptionType.Channel]: "channel",
  [ApplicationCommandOptionType.Role]: "role",
  [ApplicationCommandOptionType.Mentionable]: "mention",
  [ApplicationCommandOptionType.Attachment]: "attachment",
};

function toOption(o: OptionJson): CatalogOption {
  return {
    name: o.name,
    description: o.description,
    required: o.required === true,
    type: TYPE_LABELS[o.type] ?? "value",
    choices: (o.choices ?? []).map((c) => c.name),
  };
}

const isSub = (o: OptionJson) => o.type === ApplicationCommandOptionType.Subcommand;
const isGroup = (o: OptionJson) => o.type === ApplicationCommandOptionType.SubcommandGroup;

/** Convert a command's builder JSON into the shape help renders from. */
export function toCatalogCommand(json: CommandJson, file: string): CatalogCommand {
  const opts = json.options ?? [];
  const subcommands: CatalogSubcommand[] = [];
  for (const o of opts) {
    if (isSub(o)) {
      subcommands.push({
        name: o.name,
        description: o.description,
        options: (o.options ?? []).map(toOption),
      });
    } else if (isGroup(o)) {
      for (const s of o.options ?? []) {
        subcommands.push({
          name: `${o.name} ${s.name}`,
          description: s.description,
          options: (s.options ?? []).map(toOption),
        });
      }
    }
  }
  return {
    name: json.name,
    description: json.description,
    options: opts.filter((o) => !isSub(o) && !isGroup(o)).map(toOption),
    subcommands,
    requiredPermissions: json.default_member_permissions ?? null,
    file,
  };
}

/** `/name <required> [optional]` or one line per subcommand. */
export function usageLines(cmd: CatalogCommand): string[] {
  const fmt = (o: CatalogOption) => (o.required ? `<${o.name}>` : `[${o.name}]`);
  if (cmd.subcommands.length > 0) {
    return cmd.subcommands.map((s) => `/${cmd.name} ${s.name} ${s.options.map(fmt).join(" ")}`.trim());
  }
  return [`/${cmd.name} ${cmd.options.map(fmt).join(" ")}`.trim()];
}

/** Whether a member may see this command, given their permission bitfield. */
export function canSee(
  cmd: CatalogCommand,
  perms: { has(bits: bigint): boolean } | null | undefined,
): boolean {
  if (cmd.requiredPermissions === null) return true;
  if (!perms) return false;
  try {
    return perms.has(BigInt(cmd.requiredPermissions));
  } catch {
    return false;
  }
}

let cache: CatalogCommand[] | null = null;
let loading: Promise<CatalogCommand[]> | null = null;

/** Synchronous view of the catalog; null until loadCatalog() has resolved. */
export function getCatalogSync(): CatalogCommand[] | null {
  return cache;
}

/** Test seam. */
export function __setCatalog(c: CatalogCommand[] | null): void {
  cache = c;
  loading = null;
}

export function listCommandFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => (f.endsWith(".js") || f.endsWith(".ts")) && !f.endsWith(".d.ts"))
    .map((f) => f.replace(/\.(js|ts)$/, ""))
    .sort();
}

const COMMANDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "commands");

type CommandModule = { data?: { toJSON(): CommandJson }; execute?: unknown };

/** Build catalog entries from already-imported modules keyed by file base name. */
export function buildCatalog(mods: Record<string, CommandModule>): CatalogCommand[] {
  return Object.keys(mods)
    .sort()
    .filter((file) => mods[file].data && mods[file].execute)
    .map((file) => toCatalogCommand(mods[file].data!.toJSON(), file));
}

/** Import every command module and derive the catalog from its builder data. */
export function loadCatalog(): Promise<CatalogCommand[]> {
  if (cache) return Promise.resolve(cache);
  loading ??= (async () => {
    const mods: Record<string, CommandModule> = {};
    for (const file of listCommandFiles(COMMANDS_DIR)) {
      try {
        mods[file] = (await import(/* @vite-ignore */ `../commands/${file}.js`)) as CommandModule;
      } catch (err) {
        console.error(`Help catalog: failed to load ${file}:`, err);
      }
    }
    cache = buildCatalog(mods);
    return cache;
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}
