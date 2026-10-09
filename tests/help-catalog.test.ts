/// <reference types="vite/client" />
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PermissionsBitField, PermissionFlagsBits } from "discord.js";
import { categories, extras } from "../src/utils/helpRegistry.js";
import { listCommandFiles, buildCatalog, __setCatalog, usageLines, type CatalogCommand } from "../src/utils/commandCatalog.js";
import { buildOverviewEmbed, buildCategoryEmbed, buildCommandEmbed, isVisible } from "../src/commands/help.js";

const commandsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "commands");
let catalog: CatalogCommand[];

beforeAll(async () => {
  const globbed = import.meta.glob("../src/commands/*.ts");
  const mods: Record<string, never> = {};
  for (const [path, load] of Object.entries(globbed)) {
    mods[path.replace(/^.*\/(.*)\.ts$/, "$1")] = (await load()) as never;
  }
  catalog = buildCatalog(mods);
  __setCatalog(catalog);
}, 120000);

describe("help registry", () => {
  it("loads every command file", () => {
    expect(catalog.map((c) => c.file).sort()).toEqual(listCommandFiles(commandsDir));
  });

  it("lists every command in exactly one category", () => {
    const listed = categories.flatMap((c) => c.commands);
    const missing = catalog.map((c) => c.name).filter((n) => !listed.includes(n));
    expect(missing, `add to a category in helpRegistry.ts: ${missing.join(", ")}`).toEqual([]);
    const dupes = listed.filter((n, i) => listed.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it("references no command that does not exist", () => {
    const names = new Set(catalog.map((c) => c.name));
    const stale = [...categories.flatMap((c) => c.commands), ...Object.keys(extras)].filter((n) => !names.has(n));
    expect(stale).toEqual([]);
  });

  it("derives usage from options", () => {
    const party = catalog.find((c) => c.name === "party")!;
    expect(usageLines(party)[0]).toMatch(/^\/party <id> <country>/);
  });
});

describe("help visibility", () => {
  const user = new PermissionsBitField(0n);
  const admin = new PermissionsBitField(PermissionFlagsBits.Administrator);

  it("hides permission-gated commands from regular users", () => {
    const gated = catalog.filter((c) => c.requiredPermissions !== null);
    expect(gated.length).toBeGreaterThan(0);
    for (const c of gated) {
      expect(isVisible(c, user)).toBe(false);
      expect(buildCommandEmbed(c.name, user)).toBeNull();
    }
    const text = JSON.stringify(buildOverviewEmbed(user).toJSON());
    expect(text).not.toContain("/enable-bot");
    expect(buildCategoryEmbed("Staff", user)).toBeNull();
    expect(text).not.toMatch(/Japan, Canada/);
  });

  it("shows staff commands to admins", () => {
    expect(buildCategoryEmbed("Staff", admin)).not.toBeNull();
    expect(buildCommandEmbed("enable-bot", admin)).not.toBeNull();
  });

  it("renders a detail page for a public command", () => {
    const e = buildCommandEmbed("party", user)!.toJSON();
    expect(e.title).toBe("/party");
    expect(e.fields?.some((f) => f.name === "Options")).toBe(true);
  });
});
