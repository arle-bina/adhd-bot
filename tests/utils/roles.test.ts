import { describe, expect, it } from "vitest";
import { fixedRoleIdsForTokens, resolveRole } from "../../src/utils/roles.js";

describe("fixedRoleIdsForTokens", () => {
  it("maps headOfGov to the Head of Gov role ID", () => {
    expect(fixedRoleIdsForTokens(["headOfGov"])).toEqual(["1490113651510738976"]);
  });

  it("maps centralBankChair to the Central Bank Chair role ID", () => {
    expect(fixedRoleIdsForTokens(["centralBankChair"])).toEqual(["1494953191685750936"]);
  });

  it("maps both tokens (stacking), preserving each ID once", () => {
    expect(
      fixedRoleIdsForTokens(["headOfGov", "centralBankChair", "office:Senator"]).sort()
    ).toEqual(["1490113651510738976", "1494953191685750936"].sort());
  });

  it("returns nothing for non-fixed tokens", () => {
    expect(fixedRoleIdsForTokens(["office:Senator", "ceo", "party:Foo", "country:US"])).toEqual([]);
  });
});

describe("resolveRole — country tokens", () => {
  const noDetails = { partyName: "Independent", partyColor: null } as never;

  it("maps country:RU to the Soviet Union role", () => {
    expect(resolveRole("country:RU", noDetails)?.name).toBe("Soviet Union");
  });

  it("maps country:DD to the East Germany role", () => {
    expect(resolveRole("country:DD", noDetails)?.name).toBe("East Germany");
  });

  it("still maps the pre-existing countries", () => {
    expect(resolveRole("country:US", noDetails)?.name).toBe("United States");
    expect(resolveRole("country:UK", noDetails)?.name).toBe("United Kingdom");
  });

  /*
   * A country with no COUNTRY_NAMES entry yields no role at all rather than a
   * role named after the raw code. That is the current (silent) behaviour for
   * the 14 Cold War countries in the game's COUNTRY_ORDER that this branch
   * deliberately does not cover.
   */
  it("returns null for a country with no configured role", () => {
    expect(resolveRole("country:ZZ", noDetails)).toBeNull();
  });
});
