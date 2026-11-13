import { describe, expect, it } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data as grant } from "../../src/commands/grant.js";
import { data as revoke } from "../../src/commands/revoke.js";
import { data as grants } from "../../src/commands/grants.js";

describe("grant commands", () => {
  it.each([grant, revoke, grants])("is admin-only and guild-only", (cmd) => {
    const json = cmd.toJSON();
    expect(json.dm_permission).toBe(false);
    expect(BigInt(json.default_member_permissions ?? "0")).toBe(PermissionFlagsBits.Administrator);
  });
  it("/grants has user and list subcommands", () => {
    expect((grants.toJSON().options ?? []).map((o) => o.name)).toEqual(["user", "list"]);
  });
});
