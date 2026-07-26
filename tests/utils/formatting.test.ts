import { describe, it, expect } from "vitest";
import {
  formatElectionType,
  formatOfficeType,
  RACE_EMOJI,
  raceEmoji,
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
      "BR", "CN", "DD", "DE", "IE", "JP", "NG", "RU", "UK", "US",
    ]);
  });

  it("COUNTRY_FLAG covers every supported country", () => {
    expect(Object.keys(COUNTRY_FLAG).sort()).toEqual([
      "BR", "CN", "DD", "DE", "IE", "JP", "NG", "RU", "UK", "US",
    ]);
  });

  it("COUNTRY_COLORS covers every supported country", () => {
    expect(Object.keys(COUNTRY_COLORS).sort()).toEqual([
      "BR", "CN", "DD", "DE", "IE", "JP", "NG", "RU", "UK", "US",
    ]);
  });

  // These strings must match the Discord role names character-for-character:
  // getOrCreateRole looks roles up by name and CREATES one when nothing
  // matches, so a mismatch silently spawns an empty duplicate role.
  it("names RU and DD to match their Discord roles", () => {
    expect(COUNTRY_NAMES.RU).toBe("Soviet Union");
    expect(COUNTRY_NAMES.DD).toBe("East Germany");
  });
});

describe("raceEmoji", () => {
  // `premier` is an office key in BOTH CN and RU, so the race-keyed map alone
  // cannot disambiguate — a Soviet Premier race rendered a Chinese flag.
  it("keeps the Chinese flag for a CN premier race", () => {
    expect(raceEmoji("premier", "CN")).toBe("🇨🇳");
  });

  it("uses the Soviet flag for an RU premier race", () => {
    expect(raceEmoji("premier", "RU")).toBe("🚩");
  });

  it("falls back to the race map when no country is supplied", () => {
    expect(raceEmoji("senate")).toBe("🏛️");
  });

  it("falls back to the race map for an unknown country", () => {
    expect(raceEmoji("senate", "ZZ")).toBe("🏛️");
  });

  it("falls back to a ballot box for an unknown race", () => {
    expect(raceEmoji("totallyMadeUp")).toBe("🗳️");
  });
});

describe("formatOfficeType — RU/DD fallbacks", () => {
  it("names Soviet offices", () => {
    expect(formatOfficeType("supremeSovietDeputy")).toBe("Supreme Soviet Deputy");
    expect(formatOfficeType("nationalitiesDeputy")).toBe("Nationalities Deputy");
    expect(formatOfficeType("chairmanOfPresidium")).toBe("Chairman of the Presidium");
    expect(formatOfficeType("republicSupremeSoviet")).toBe("Republic Deputy");
  });

  it("names East German offices", () => {
    expect(formatOfficeType("generalSecretary")).toBe("General Secretary");
    expect(formatOfficeType("volkskammerDeputy")).toBe("Deputy");
  });

  it("EXCHANGE_LABELS covers all exchanges", () => {
    expect(Object.keys(EXCHANGE_LABELS).sort()).toEqual([
      "b3", "dax", "ftse", "global", "iseq", "nikkei", "nyse", "sse",
    ]);
  });
});
