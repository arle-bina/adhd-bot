import { describe, expect, it } from "vitest";
import { asksForSources, compactSources } from "../src/utils/ask-presentation.js";

describe("Ask Discord presentation", () => {
  it("keeps sources hidden unless requested", () => {
    expect(asksForSources("Map Democratic Senate candidates")).toBe(false);
    expect(asksForSources("Map candidates and cite sources")).toBe(true);
  });

  it("limits an explicit source view to two compact entries", () => {
    expect(compactSources({ files: ["fallback.ts"], sources: [
      { kind: "state", label: "gamestate: map_snapshot (country=US)" },
      { kind: "knowledge", label: "Election mechanics" },
      { kind: "knowledge", label: "Never shown" },
    ] })).toBe("• gamestate: map_snapshot\n• Election mechanics");
  });
});
