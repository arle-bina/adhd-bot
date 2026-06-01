import { describe, expect, it } from "vitest";
import { fixedRoleIdsForTokens } from "../../src/utils/roles.js";

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
