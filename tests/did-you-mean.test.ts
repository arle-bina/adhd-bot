import { describe, it, expect } from "vitest";
import { suggest, didYouMeanLine, editDistance } from "../src/utils/didYouMean.js";

describe("didYouMean", () => {
  const corps = ["Apex Media", "National Rail", "Lunar Energy", "Apex Rail"];
  it("computes edit distance", () => expect(editDistance("kitten", "sitting")).toBe(3));
  it("catches typos", () => expect(suggest("Lunr Energy", corps)[0]).toBe("Lunar Energy"));
  it("prefers prefix matches", () => expect(suggest("apex", corps)).toEqual(["Apex Rail", "Apex Media"]));
  it("matches a close single word", () => expect(suggest("natonal", corps)).toContain("National Rail"));
  it("returns nothing for gibberish", () => {
    expect(suggest("zzzzzzzz", corps)).toEqual([]);
    expect(didYouMeanLine("zzzzzzzz", corps)).toBe("");
  });
  it("formats a line", () => expect(didYouMeanLine("lunr energy", corps)).toBe("\nDid you mean `Lunar Energy`?"));
});
