import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  __setPrefsFileForTests,
  getPrefs,
  updatePrefs,
  resetPrefs,
  addFollow,
  removeFollow,
  resolveDefaults,
  countryOrDefault,
  formatNumber,
  usersWith,
  MAX_FOLLOWS,
  ACCENT_PALETTE,
} from "../src/utils/userPrefsStore.js";

let file: string;
beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), "prefs-")), "user-prefs.json");
  __setPrefsFileForTests(file);
});

describe("userPrefsStore", () => {
  it("returns defaults for unknown users", () => {
    const p = getPrefs("u1");
    expect(p.privateReplies).toBe(true);
    expect(p.numberFormat).toBe("compact");
    expect(p.defaultCountry).toBeNull();
    expect(p.follows).toEqual([]);
  });

  it("persists updates atomically and survives a reload", () => {
    updatePrefs("u1", { defaultCountry: "UK", notifyTurn: true });
    __setPrefsFileForTests(file);
    const p = getPrefs("u1");
    expect(p.defaultCountry).toBe("UK");
    expect(p.notifyTurn).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf-8")).users.u1.defaultCountry).toBe("UK");
  });

  it("drops invalid values on load", () => {
    writeFileSync(file, JSON.stringify({ users: { u1: { accent: "mauve", numberFormat: "huge", follows: [{ kind: "x" }, { kind: "politician", name: "A" }] } } }));
    __setPrefsFileForTests(file);
    const p = getPrefs("u1");
    expect(p.accent).toBeNull();
    expect(p.numberFormat).toBe("compact");
    expect(p.follows).toEqual([{ kind: "politician", name: "A" }]);
  });

  it("recovers from a corrupt file with an empty store", () => {
    writeFileSync(file, "{not json");
    __setPrefsFileForTests(file);
    expect(getPrefs("u1").defaultCountry).toBeNull();
  });

  it("resets a user", () => {
    updatePrefs("u1", { defaultCountry: "US" });
    resetPrefs("u1");
    expect(getPrefs("u1").defaultCountry).toBeNull();
  });

  it("manages follows with dedupe and cap", () => {
    expect(addFollow("u1", { kind: "politician", name: "Jane Doe" })).toBe("added");
    expect(addFollow("u1", { kind: "politician", name: "jane doe" })).toBe("exists");
    expect(addFollow("u1", { kind: "party", id: "1", country: "UK" })).toBe("added");
    expect(removeFollow("u1", { kind: "politician", name: "JANE DOE" })).toBe(true);
    expect(removeFollow("u1", { kind: "politician", name: "nobody" })).toBe(false);
    for (let i = 0; i < MAX_FOLLOWS; i++) addFollow("u2", { kind: "party", id: String(i), country: "US" });
    expect(addFollow("u2", { kind: "party", id: "extra", country: "US" })).toBe("full");
  });

  it("lists opted-in users", () => {
    updatePrefs("a", { notifyTurn: true });
    updatePrefs("b", { notifyFollows: true });
    expect(usersWith("notifyTurn").map((u) => u.userId)).toEqual(["a"]);
    expect(usersWith("notifyFollows").map((u) => u.userId)).toEqual(["b"]);
  });
});

describe("resolveDefaults", () => {
  it("is ephemeral and compact with no stored prefs", () => {
    expect(resolveDefaults("nobody")).toEqual({
      country: undefined,
      politician: undefined,
      ephemeral: true,
      numberFormat: "compact",
      accentColor: undefined,
    });
  });

  it("reflects stored prefs", () => {
    updatePrefs("u1", { defaultCountry: "JP", defaultPolitician: "Taro", privateReplies: false, numberFormat: "full", accent: "gold" });
    expect(resolveDefaults("u1")).toEqual({
      country: "JP",
      politician: "Taro",
      ephemeral: false,
      numberFormat: "full",
      accentColor: ACCENT_PALETTE.gold.color,
    });
  });

  it("countryOrDefault prefers the explicit option", () => {
    updatePrefs("u1", { defaultCountry: "JP" });
    expect(countryOrDefault("u1", "UK")).toBe("UK");
    expect(countryOrDefault("u1", null)).toBe("JP");
    expect(countryOrDefault("none", null)).toBeUndefined();
  });
});

describe("formatNumber", () => {
  it("formats compact and full", () => {
    expect(formatNumber(1234567, "compact")).toBe("1.2M");
    expect(formatNumber(1234567, "full")).toBe("1,234,567");
    expect(formatNumber(-2500, "compact")).toBe("-2.5K");
    expect(formatNumber(42, "compact")).toBe("42");
  });
});
