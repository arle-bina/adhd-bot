import { describe, it, expect } from "vitest";
import {
  formatElectionType,
  formatOfficeType,
  RACE_EMOJI,
  COUNTRY_NAMES,
  COUNTRY_FLAG,
  COUNTRY_COLORS,
  EXCHANGE_LABELS,
} from "../../src/utils/formatting.js";

describe("formatElectionType", () => {
  it.each([
    ["senate", "Senate"],
    ["house", "House"],
    ["stateSenate", "State Senate"],
    ["governor", "Governor"],
    ["president", "Presidential"],
    ["vicePresident", "Vice Presidential"],
    ["commons", "Commons"],
    ["primeMinister", "Prime Minister"],
    ["chancellor", "Chancellor"],
    ["shugiin", "Shūgiin"],
    ["sangiin", "Sangiin"],
    ["bundestag", "Bundestag"],
    ["centralBankChair", "Central Bank Chair"],
    ["regionalCouncil", "Regional Council"],
    ["premier", "Premier"],
    ["ministerPresident", "Minister-President"],
  ])("maps '%s' to '%s'", (input, expected) => {
    expect(formatElectionType(input)).toBe(expected);
  });

  it("passes through unknown types unchanged", () => {
    expect(formatElectionType("unknown_type")).toBe("unknown_type");
  });
});

describe("formatOfficeType", () => {
  it.each([
    ["governor", "Governor"],
    ["senate", "Senator"],
    ["house", "Representative"],
    ["stateSenate", "State Senator"],
    ["president", "President"],
    ["vicePresident", "Vice President"],
    ["commons", "MP"],
    ["primeMinister", "Prime Minister"],
    ["chancellor", "Chancellor"],
    ["shugiin", "Representative"],
    ["sangiin", "Councillor"],
    ["bundestag", "MdB"],
    ["centralBankChair", "Central Bank Chair"],
    ["regionalCouncil", "Regional Councillor"],
    ["premier", "Premier"],
    ["ministerPresident", "Minister-President"],
  ])("maps '%s' to '%s'", (input, expected) => {
    expect(formatOfficeType(input)).toBe(expected);
  });

  it("passes through unknown types unchanged", () => {
    expect(formatOfficeType("unknown_type")).toBe("unknown_type");
  });
});

describe("constant maps", () => {
  it("RACE_EMOJI has entries for all election types", () => {
    expect(Object.keys(RACE_EMOJI).sort()).toEqual([
      "bundestag", "centralBankChair", "chancellor", "commons", "governor",
      "house", "ministerPresident", "premier", "president", "primeMinister",
      "regionalCouncil", "sangiin", "senate", "shugiin", "stateSenate",
      "vicePresident",
    ]);
  });

  it("COUNTRY_NAMES covers all 5 countries", () => {
    expect(Object.keys(COUNTRY_NAMES).sort()).toEqual(["CA", "DE", "JP", "UK", "US"]);
  });

  it("COUNTRY_FLAG covers all 5 countries", () => {
    expect(Object.keys(COUNTRY_FLAG).sort()).toEqual(["CA", "DE", "JP", "UK", "US"]);
  });

  it("COUNTRY_COLORS covers all 5 countries", () => {
    expect(Object.keys(COUNTRY_COLORS).sort()).toEqual(["CA", "DE", "JP", "UK", "US"]);
  });

  it("EXCHANGE_LABELS covers all exchanges", () => {
    expect(Object.keys(EXCHANGE_LABELS).sort()).toEqual(["dax", "ftse", "global", "nikkei", "nyse", "tsx"]);
  });
});
