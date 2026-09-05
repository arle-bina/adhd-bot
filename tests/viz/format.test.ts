import { describe, it, expect } from "vitest";
import {
  compactMoney,
  compactNumber,
  signedPercent,
  formatValue,
  niceScale,
  tickIndices,
} from "../../src/utils/viz/format.js";

describe("compactMoney", () => {
  it("scales to the right magnitude", () => {
    expect(compactMoney(42.3)).toBe("$42.30");
    expect(compactMoney(27_100)).toBe("$27.1K");
    expect(compactMoney(946_400_000)).toBe("$946.4M");
    expect(compactMoney(1_610_000_000)).toBe("$1.61B");
    expect(compactMoney(2_500_000_000_000)).toBe("$2.50T");
  });

  it("keeps the sign outside the symbol", () => {
    expect(compactMoney(-946_400_000)).toBe("-$946.4M");
  });

  it("honours a non-dollar symbol", () => {
    expect(compactMoney(18_400, "£")).toBe("£18.4K");
  });
});

describe("compactNumber", () => {
  it("scales and thousands-separates", () => {
    expect(compactNumber(412)).toBe("412");
    expect(compactNumber(-412)).toBe("-412");
    expect(compactNumber(27_100)).toBe("27.1K");
    expect(compactNumber(1_610_000_000)).toBe("1.61B");
  });
});

describe("signedPercent", () => {
  it("always carries a sign, so direction never rests on colour", () => {
    expect(signedPercent(4.23)).toBe("+4.2%");
    expect(signedPercent(-1.8)).toBe("-1.8%");
    expect(signedPercent(0)).toBe("+0.0%");
  });
});

describe("formatValue", () => {
  it("dispatches on format", () => {
    expect(formatValue(1500, "money", "$")).toBe("$1.5K");
    expect(formatValue(1500, "number")).toBe("1.5K");
    expect(formatValue(1.5, "percent")).toBe("+1.5%");
  });
});

describe("niceScale", () => {
  it("rounds bounds outward onto the step", () => {
    const s = niceScale(3, 97, 5);
    expect(s.min).toBeLessThanOrEqual(3);
    expect(s.max).toBeGreaterThanOrEqual(97);
    expect(s.min % s.step).toBeCloseTo(0, 6);
  });

  it("survives a flat series without collapsing to zero height", () => {
    const s = niceScale(50, 50);
    expect(s.max).toBeGreaterThan(s.min);
  });

  it("survives non-finite input", () => {
    const s = niceScale(NaN, NaN);
    expect(Number.isFinite(s.min)).toBe(true);
    expect(Number.isFinite(s.max)).toBe(true);
    expect(s.max).toBeGreaterThan(s.min);
  });
});

describe("tickIndices", () => {
  it("anchors both ends", () => {
    const t = tickIndices(60, 6);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBe(59);
  });

  it("returns every index when there are fewer than requested", () => {
    expect(tickIndices(3, 6)).toEqual([0, 1, 2]);
  });

  it("handles an empty series", () => {
    expect(tickIndices(0, 6)).toEqual([]);
  });

  it("never repeats an index", () => {
    const t = tickIndices(7, 6);
    expect(new Set(t).size).toBe(t.length);
  });
});
