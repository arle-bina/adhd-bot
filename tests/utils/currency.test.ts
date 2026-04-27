import { describe, expect, it } from "vitest";
import { convertAnchorToCurrency, convertCurrency } from "../../src/utils/currency.js";

describe("convertAnchorToCurrency", () => {
  it("multiplies anchor values by the target currency rate", () => {
    const rates = { USD: 0.7, GBP: 0.75, JPY: 91 };
    expect(convertAnchorToCurrency(100, "USD", rates)).toBe(70);
    expect(convertAnchorToCurrency(100, "GBP", rates)).toBe(75);
    expect(convertAnchorToCurrency(100, "JPY", rates)).toBe(9100);
  });

  it("falls back to identity when the target rate is missing", () => {
    expect(convertAnchorToCurrency(250, "EUR", { USD: 0.7 })).toBe(250);
  });
});

describe("convertCurrency", () => {
  it("still converts between local currencies through the anchor rate map", () => {
    const rates = { USD: 0.7, GBP: 0.75, JPY: 91 };
    expect(convertCurrency(91, "JPY", "USD", rates)).toBeCloseTo(0.7);
    expect(convertCurrency(75, "GBP", "USD", rates)).toBeCloseTo(70);
  });
});
