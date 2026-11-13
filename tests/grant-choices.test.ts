import { describe, expect, it } from "vitest";
import { decodeChoice, encodeChoice, filterChoices, grantChoices } from "../src/utils/grantChoices.js";

describe("grant choice encoding", () => {
  it("round-trips scope and product id", () => {
    expect(decodeChoice(encodeChoice({ scope: "product", productId: "canada" }))).toEqual({ scope: "product", productId: "canada" });
    expect(decodeChoice("tier:supporter-plus")).toEqual({ scope: "tier", productId: "supporter-plus" });
  });
  it("handles choices with no product id", () => {
    expect(encodeChoice({ scope: "everything" })).toBe("everything:");
    expect(decodeChoice("everything:")).toEqual({ scope: "everything" });
  });
  it("rejects malformed values", () => {
    expect(decodeChoice("nonsense")).toBeNull();
    expect(decodeChoice(":x")).toBeNull();
  });
  it("filters by typed text and caps at 25", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ label: `Item ${i}`, scope: "product", productId: `p${i}` }));
    expect(filterChoices(many, "")).toHaveLength(25);
    expect(filterChoices(many, "item 7")).toEqual([{ name: "Item 7", value: "product:p7" }]);
  });
  it("builds revoke choices from grant ids", () => {
    expect(grantChoices([{ id: "g1", label: "Corporate Warfare" }, { label: "no id" }])).toEqual([
      { name: "Corporate Warfare", value: "g1" },
    ]);
  });
});
