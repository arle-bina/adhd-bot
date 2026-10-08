import { describe, it, expect } from "vitest";
import {
  clampPage,
  compact,
  controlSplit,
  featId,
  formatDuration,
  humanize,
  pageCount,
  parseCommodityKey,
  parseCountryCode,
  parseFeatId,
  pct,
  progressBar,
  secondsUntil,
  share,
  truncate,
  unemploymentPct,
  leaderLine,
} from "../src/utils/featureFormat.js";

describe("featureFormat", () => {
  it("compacts numbers", () => {
    expect(compact(1_500_000_000)).toBe("1.5B");
    expect(compact(-2_400_000)).toBe("-2.4M");
    expect(compact(null)).toBe("n/a");
    expect(compact(Number.NaN)).toBe("n/a");
  });

  it("formats percents", () => {
    expect(pct(2.345, 1)).toBe("2.3%");
    expect(pct(2, 0, true)).toBe("+2%");
    expect(pct(undefined)).toBe("n/a");
  });

  it("normalises unemployment units", () => {
    expect(unemploymentPct(0.052)).toBeCloseTo(5.2);
    expect(unemploymentPct(5.2)).toBe(5.2);
    expect(unemploymentPct(null)).toBeNull();
  });

  it("parses country codes", () => {
    expect(parseCountryCode(" us ")).toBe("US");
    expect(parseCountryCode("usa1")).toBeNull();
    expect(parseCountryCode(null)).toBeNull();
  });

  it("parses commodity keys", () => {
    expect(parseCommodityKey("Building Materials")).toBe("building_materials");
    expect(parseCommodityKey("a;drop")).toBeNull();
    expect(parseCommodityKey("")).toBeNull();
  });

  it("round trips custom ids", () => {
    expect(parseFeatId(featId("country", "economy", "US"))).toEqual({ kind: "country", args: ["economy", "US"] });
    expect(parseFeatId("ticket_close")).toBeNull();
    expect(parseFeatId("feat_")).toBeNull();
  });

  it("pages and clamps", () => {
    expect(pageCount(0, 5)).toBe(1);
    expect(pageCount(11, 5)).toBe(3);
    expect(clampPage(9, 3)).toBe(2);
    expect(clampPage(-1, 3)).toBe(0);
    expect(clampPage(Number.NaN, 3)).toBe(0);
  });

  it("builds progress bars within range", () => {
    expect(progressBar(50, 10)).toContain("50%");
    expect(progressBar(500, 10)).toContain("100%");
    expect(progressBar(null, 10)).toContain("0%");
  });

  it("computes countdowns", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(secondsUntil("2026-01-01T00:01:00Z", now)).toBe(60);
    expect(secondsUntil("2025-12-31T00:00:00Z", now)).toBeNull();
    expect(secondsUntil(null, now)).toBeNull();
    expect(formatDuration(3725)).toBe("1h 2m");
    expect(formatDuration(75)).toBe("1m 15s");
  });

  it("handles small helpers", () => {
    expect(humanize("building_materials")).toBe("Building materials");
    expect(truncate("abcdefghij", 5)).toBe("abcd...");
    expect(share(1, 4)).toBe(25);
    expect(share(1, 0)).toBe(0);
    expect(controlSplit(0.62).a).toBeCloseTo(62);
    expect(controlSplit(150).a).toBe(100);
    expect(leaderLine(null)).toBe("Vacant");
    expect(leaderLine({ name: "A", party: "B" })).toBe("A (B)");
  });
});
