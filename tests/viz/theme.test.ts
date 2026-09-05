import { describe, it, expect } from "vitest";
import {
  SERIES,
  OTHERS,
  brandColor,
  seriesColor,
  contrastRatio,
  ensureVisible,
  deltaColor,
  alpha,
  hexToInt,
  STATUS,
  INK,
  SURFACE,
} from "../../src/utils/viz/theme.js";

describe("series palette", () => {
  it("assigns colours by fixed slot, never cycling", () => {
    expect(seriesColor(0)).toBe(SERIES[0]);
    expect(seriesColor(7)).toBe(SERIES[7]);
    // A 9th series must not wrap around to slot 1 and duplicate an identity.
    expect(seriesColor(8)).toBe(OTHERS);
    expect(seriesColor(99)).toBe(OTHERS);
  });

  it("keeps every slot distinguishable against the chart surface", () => {
    for (const hex of SERIES) {
      expect(contrastRatio(hex, SURFACE.plot)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("brandColor", () => {
  it("prefers the entity's own colour", () => {
    expect(brandColor("#2a5fd6", 3)).toBe("#2a5fd6");
  });

  it("accepts a bare hex without the leading hash", () => {
    expect(brandColor("2a5fd6", 3)).toBe("#2a5fd6");
  });

  it("falls back to the fixed slot for missing or malformed values", () => {
    expect(brandColor(null, 2)).toBe(SERIES[2]);
    expect(brandColor(undefined, 2)).toBe(SERIES[2]);
    expect(brandColor("", 2)).toBe(SERIES[2]);
    expect(brandColor("not-a-colour", 2)).toBe(SERIES[2]);
    expect(brandColor("#12345", 2)).toBe(SERIES[2]);
  });

  it("lifts a party colour that would be invisible on the surface", () => {
    // CDU/CSU's real hex sits at ~1.1:1 on the plot surface and rendered as
    // empty benches before this guard.
    const lifted = brandColor("#32302e", 0);
    expect(lifted).not.toBe("#32302e");
    expect(contrastRatio(lifted, SURFACE.plot)).toBeGreaterThanOrEqual(2.2);
  });
});

describe("ensureVisible", () => {
  it("leaves an already-visible colour untouched", () => {
    expect(ensureVisible("#e4003b")).toBe("#e4003b");
  });

  it("gives pure black the neutral slot rather than a black-grey", () => {
    expect(ensureVisible("#000000")).toBe("#7a7a8c");
  });

  it("always reaches the contrast floor", () => {
    for (const hex of ["#32302e", "#0a0a0a", "#101820", "#1d1d2a", "#222222"]) {
      expect(contrastRatio(ensureVisible(hex), SURFACE.plot)).toBeGreaterThanOrEqual(2.2);
    }
  });

  it("passes malformed input straight through", () => {
    expect(ensureVisible("rgb(1,2,3)")).toBe("rgb(1,2,3)");
  });
});

describe("deltaColor", () => {
  it("maps sign to the reserved status colours", () => {
    expect(deltaColor(1)).toBe(STATUS.good);
    expect(deltaColor(-1)).toBe(STATUS.critical);
    expect(deltaColor(0)).toBe(INK.muted);
  });
});

describe("alpha", () => {
  it("expands shorthand hex", () => {
    expect(alpha("#f00", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("handles full hex with and without the hash", () => {
    expect(alpha("#3987e5", 1)).toBe("rgba(57, 135, 229, 1)");
    expect(alpha("3987e5", 1)).toBe("rgba(57, 135, 229, 1)");
  });
});

describe("hexToInt", () => {
  it("converts to a Discord embed colour integer", () => {
    expect(hexToInt("#ffffff")).toBe(0xffffff);
    expect(hexToInt("000000")).toBe(0);
    expect(hexToInt("#f00")).toBe(0xff0000);
  });
});
