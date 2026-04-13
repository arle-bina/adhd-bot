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
    ["governor", "Governor"],
    ["president", "Presidential"],
    ["commons", "Commons"],
    ["primeMinister", "Prime Minister"],
    ["shugiin", "Shūgiin"],
    ["sangiin", "Sangiin"],
    ["bundestag", "Bundestag"],
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
    ["commons", "MP"],
    ["primeMinister", "Prime Minister"],
    ["shugiin", "Representative"],
    ["sangiin", "Councillor"],
    ["bundestag", "MdB"],
  ])("maps '%s' to '%s'", (input, expected) => {
    expect(formatOfficeType(input)).toBe(expected);
  });

  it("passes through unknown types unchanged", () => {
    expect(formatOfficeType("unknown_type")).toBe("unknown_type");
  });
});

describe("constant maps", () => {
  it("RACE_EMOJI has entries for all election types", () => {
    expect(Object.keys(RACE_EMOJI)).toEqual(
      expect.arrayContaining(["senate", "house", "shugiin", "sangiin", "bundestag"])
    );
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
