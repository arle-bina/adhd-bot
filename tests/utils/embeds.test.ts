import { describe, it, expect } from "vitest";
import { linkList, linkRun, subtext, meta } from "../../src/utils/embeds.js";

const DESCRIPTION_LIMIT = 4096;

/** A link long enough that a handful of them blow the description cap. */
function bigItem(i: number) {
  return {
    label: `Corporation with a rather long name number ${i}`,
    url: `https://www.ahousedividedgame.com/corporation/${i}${"0".repeat(80)}`,
  };
}

describe("linkList", () => {
  it("renders one markdown link per line", () => {
    const out = linkList([
      { label: "Expeditors", url: "https://example.com/1" },
      { label: "Rgold", url: "https://example.com/2" },
    ]);
    expect(out).toBe("[Expeditors](https://example.com/1)\n[Rgold](https://example.com/2)");
  });

  it("falls back to plain text when an entity has no page", () => {
    expect(linkList([{ label: "German Media Enterprise", url: null }])).toBe("German Media Enterprise");
  });

  it("renders a note as muted trailing text", () => {
    expect(linkList([{ label: "Polish Media", url: "https://x/1", note: "NatCorp" }])).toBe(
      "[Polish Media](https://x/1) · *NatCorp*",
    );
  });

  it("collapses the tail past the limit into a count", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ label: `C${i}`, url: `https://x/${i}` }));
    const out = linkList(items, 10);
    expect(out).toContain("+20 more");
    expect(out.split("\n")).toHaveLength(11);
  });

  it("stays inside Discord's description cap", () => {
    const out = linkList(Array.from({ length: 200 }, (_, i) => bigItem(i)), 200);
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
  });

  it("truncates on whole lines, never mid-URL", () => {
    // A link cut in half renders as broken markdown with a visible raw URL.
    const out = linkList(Array.from({ length: 200 }, (_, i) => bigItem(i)), 200);
    for (const line of out.split("\n")) {
      if (line.startsWith("-#")) continue;
      expect(line).toMatch(/^\[.*\]\(https:\/\/\S+\)$/);
    }
  });

  it("returns empty for no items rather than a stray bullet", () => {
    expect(linkList([])).toBe("");
  });
});

describe("linkRun", () => {
  it("joins links inline with the house separator", () => {
    expect(
      linkRun([
        { label: "A", url: "https://x/a" },
        { label: "B", url: "https://x/b" },
      ]),
    ).toBe("[A](https://x/a) · [B](https://x/b)");
  });

  it("stays inside the description cap and does not split a URL", () => {
    const out = linkRun(Array.from({ length: 200 }, (_, i) => bigItem(i)), 200);
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
    // Every opening bracket must find its closing paren.
    expect((out.match(/\[/g) ?? []).length).toBe((out.match(/\]\(/g) ?? []).length);
  });

  it("returns empty for no items", () => {
    expect(linkRun([])).toBe("");
  });
});

describe("meta", () => {
  it("drops empty parts instead of leaving dangling separators", () => {
    expect(meta("Turn 612", null, undefined, false, "USD")).toBe("Turn 612 · USD");
  });

  it("returns empty when everything is absent", () => {
    expect(meta(null, undefined, false)).toBe("");
  });
});

describe("subtext", () => {
  it("uses Discord's small-text marker", () => {
    expect(subtext("Values USD")).toBe("-# Values USD");
  });
});
