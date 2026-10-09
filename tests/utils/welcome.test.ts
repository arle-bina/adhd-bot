import { describe, it, expect, beforeAll } from "vitest";
import { ButtonStyle } from "discord.js";
import { buildWelcomeButtons, buildWelcomeEmbed, type WelcomeLinks } from "../../src/utils/welcome.js";
import { renderWelcomeCardSync, WELCOME_CARD } from "../../src/utils/viz/welcome.js";
import { warmBrandAssets } from "../../src/utils/viz/brand.js";
import { GEO } from "../../src/utils/viz/theme.js";

const links: WelcomeLinks = {
  site: "https://www.ahousedividedgame.com/",
  register: "https://www.ahousedividedgame.com/register",
  settings: "https://www.ahousedividedgame.com/settings",
};

function pngSize(buf: Buffer): { width: number; height: number } {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(buf.subarray(0, 8).equals(signature)).toBe(true);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

beforeAll(async () => {
  await warmBrandAssets();
});

describe("renderWelcomeCardSync", () => {
  it("renders a 2x PNG at the fixed card size", () => {
    const buf = renderWelcomeCardSync({
      displayName: "Clement Attlee",
      username: "attlee45",
      memberNumber: 1234,
      footerLeft: "A House Divided - Online Political Sim/RPG",
    });
    expect(pngSize(buf)).toEqual({ width: WELCOME_CARD.width * GEO.dpr, height: WELCOME_CARD.height * GEO.dpr });
    expect(buf.length).toBeLessThan(2_000_000);
  });

  it("survives a missing avatar, a missing member count and an overlong name", () => {
    const buf = renderWelcomeCardSync({
      displayName: "x".repeat(200),
      avatarImage: null,
      memberNumber: null,
    });
    expect(pngSize(buf).width).toBe(WELCOME_CARD.width * GEO.dpr);
  });
});

describe("buildWelcomeEmbed", () => {
  const embed = buildWelcomeEmbed("1474142953437135142", links).toJSON();
  const text = [embed.description, ...(embed.fields ?? []).map((f) => `${f.name} ${f.value}`)].join("\n");

  it("covers accepting the rules, registering and linking", () => {
    expect(text).toContain("<#1474142953437135142>");
    expect(text).toContain("`/accept`");
    expect(text).toContain(links.register);
    expect(text).toContain(links.settings);
    expect(text.toLowerCase()).toContain("optional");
  });

  it("keeps every field inside Discord's limits", () => {
    for (const f of embed.fields ?? []) {
      expect(f.name.length).toBeLessThanOrEqual(256);
      expect(f.value.length).toBeLessThanOrEqual(1024);
    }
    expect((embed.description ?? "").length).toBeLessThanOrEqual(4096);
  });

  it("falls back to plain text when the rules channel is not configured", () => {
    const json = buildWelcomeEmbed(undefined, links).toJSON();
    expect(json.fields?.[0].value).toContain("the rules channel");
    expect(json.fields?.[0].value).not.toContain("<#undefined>");
  });

  it("does not use em or en dashes in player copy", () => {
    expect(text).not.toMatch(/[–—]/);
  });
});

describe("buildWelcomeButtons", () => {
  it("links to play, register and settings", () => {
    const row = buildWelcomeButtons(links).toJSON();
    const urls = row.components.map((c) => ("url" in c ? c.url : null));
    expect(urls).toEqual([links.site, links.register, links.settings]);
    expect(row.components.every((c) => c.style === ButtonStyle.Link)).toBe(true);
  });
});
