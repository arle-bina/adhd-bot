import { describe, it, expect } from "vitest";
import { data as electionCommand } from "../../src/commands/election.js";
import { formatElectionType } from "../../src/utils/formatting.js";

describe("formatElectionType", () => {
  it.each([
    ["senate", "Senate"],
    ["house", "House"],
    ["governor", "Governor"],
    ["president", "Presidential"],
    ["commons", "Commons"],
    ["caCommons", "House of Commons"],
    ["provincialLegislature", "Provincial Legislature"],
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

it("registers the Canadian race types accepted by the game API", () => {
  const options = electionCommand.toJSON().options;
  const race = options?.find((option) => option.name === "race");
  expect(race && "choices" in race && race.choices?.map(({ name, value }) => ({ name, value }))).toEqual(
    expect.arrayContaining([
      { name: "House of Commons (CA)", value: "caCommons" },
      { name: "Provincial Legislature (CA)", value: "provincialLegislature" },
    ]),
  );
});
