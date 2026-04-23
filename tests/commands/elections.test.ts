import { describe, it, expect } from "vitest";
import { formatElectionType } from "../../src/utils/formatting.js";

describe("formatElectionType", () => {
  it.each([
    ["senate", "Senate"],
    ["house", "House"],
    ["governor", "Governor"],
    ["president", "Presidential"],
    ["commons", "Commons"],
    ["snap_commons", "Snap Commons"],
    ["primeMinister", "Prime Minister"],
    ["chancellor", "Chancellor"],
    ["shugiin", "Shūgiin"],
    ["snap_shugiin", "Snap Shūgiin"],
    ["centralBankChair", "Central Bank Chair"],
    ["bundestag", "Bundestag"],
    ["snap_bundestag", "Snap Bundestag"],
  ])("maps '%s' to '%s'", (input, expected) => {
    expect(formatElectionType(input)).toBe(expected);
  });

  it("passes through unknown types unchanged", () => {
    expect(formatElectionType("unknown_type")).toBe("unknown_type");
  });
});
