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
    ["snap_commons", "Snap Commons"],
    ["primeMinister", "Prime Minister"],
    ["chancellor", "Chancellor"],
    ["shugiin", "Shūgiin"],
    ["snap_shugiin", "Snap Shūgiin"],
    ["sangiin", "Sangiin"],
    ["bundestag", "Bundestag"],
    ["snap_bundestag", "Snap Bundestag"],
    ["centralBankChair", "Central Bank Chair"],
    ["regionalCouncil", "Regional Council"],
    ["premier", "Premier"],
    ["ministerPresident", "Minister-President"],
    ["landtag", "Landtag"],
    ["taoiseach", "Taoiseach"],
    ["dail", "Dáil"],
    ["snap_dail", "Snap Dáil"],
    ["uachtaran", "Uachtarán"],
    ["localCouncil", "Local Council"],
    ["chamber", "Chamber of Deputies"],
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
    ["snap_commons", "MP"],
    ["primeMinister", "Prime Minister"],
    ["chancellor", "Chancellor"],
    ["shugiin", "Representative"],
    ["snap_shugiin", "Representative"],
    ["sangiin", "Councillor"],
    ["bundestag", "MdB"],
    ["snap_bundestag", "MdB"],
    ["centralBankChair", "Central Bank Chair"],
    ["regionalCouncil", "Regional Councillor"],
    ["premier", "Premier"],
    ["ministerPresident", "Minister-President"],
    ["landtag", "MdL"],
    ["taoiseach", "Taoiseach"],
    ["tanaiste", "Tánaiste"],
    ["uachtaran", "Uachtarán"],
    ["dail", "TD"],
    ["snap_dail", "TD"],
    ["localCouncil", "Councillor"],
    ["chamber", "Federal Deputy"],
  ])("maps '%s' to '%s'", (input, expected) => {
    expect(formatOfficeType(input)).toBe(expected);
  });

  it("passes through unknown types unchanged", () => {
    expect(formatOfficeType("unknown_type")).toBe("unknown_type");
  });
});

describe("constant maps", () => {
  it("RACE_EMOJI has entries for all election types including snaps", () => {
    expect(Object.keys(RACE_EMOJI).sort()).toEqual([
      "bundestag", "centralBankChair", "chamber", "chancellor", "commons",
      "dail", "governor", "house", "landtag", "localCouncil",
      "ministerPresident", "npcDelegate", "peoplesCongress", "premier",
      "president", "primeMinister", "regionalCouncil", "sangiin", "senate",
      "shugiin", "snap_bundestag", "snap_commons", "snap_dail",
      "snap_shugiin", "stateSenate", "taoiseach", "uachtaran", "vicePresident",
    ]);
  });

  it("COUNTRY_NAMES covers every supported country", () => {
    expect(Object.keys(COUNTRY_NAMES).sort()).toEqual([
      "BR", "CN", "DE", "IE", "JP", "NG", "UK", "US",
    ]);
  });

  it("COUNTRY_FLAG covers every supported country", () => {
    expect(Object.keys(COUNTRY_FLAG).sort()).toEqual([
      "BR", "CN", "DE", "IE", "JP", "NG", "UK", "US",
    ]);
  });

  it("COUNTRY_COLORS covers every supported country", () => {
    expect(Object.keys(COUNTRY_COLORS).sort()).toEqual([
      "BR", "CN", "DE", "IE", "JP", "NG", "UK", "US",
    ]);
  });

  it("EXCHANGE_LABELS covers all exchanges", () => {
    expect(Object.keys(EXCHANGE_LABELS).sort()).toEqual([
      "b3", "dax", "ftse", "global", "iseq", "nikkei", "nyse", "sse",
    ]);
  });
});
