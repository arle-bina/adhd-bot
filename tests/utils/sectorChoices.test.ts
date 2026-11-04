import { describe, it, expect } from "vitest";
import { SECTOR_CHOICES, normalizeSectorType } from "../../src/utils/sectorChoices.js";

describe("sector choices", () => {
  it("no longer offers the retired automobiles/entertainment values", () => {
    const values = SECTOR_CHOICES.map((c) => c.value as string);
    expect(values).not.toContain("automobiles");
    expect(values).not.toContain("entertainment");
    expect(values).toContain("manufacturing_vehicles");
    expect(values).toContain("media_entertainment");
  });

  it("keeps unique values and player-facing labels", () => {
    const values = SECTOR_CHOICES.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
    expect(SECTOR_CHOICES.find((c) => c.value === "manufacturing_vehicles")?.name).toBe("Automobiles");
  });

  it("aliases legacy values and passes current ones through", () => {
    expect(normalizeSectorType("automobiles")).toBe("manufacturing_vehicles");
    expect(normalizeSectorType("entertainment")).toBe("media_entertainment");
    expect(normalizeSectorType("retail")).toBe("retail");
  });
});
