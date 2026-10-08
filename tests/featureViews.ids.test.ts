import { describe, expect, it } from "vitest";
import { countryRows } from "../src/utils/featureViews.js";

// Discord rejects a message whose components share a custom id (50035).
describe("feature view components", () => {
  it("country rows have unique custom ids on every tab", () => {
    for (const tab of ["overview", "economy", "legislature", "budget"] as const) {
      const ids = countryRows(tab, "US").flatMap((r) =>
        r.toJSON().components.map((c) => ("custom_id" in c ? c.custom_id : "")),
      );
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
