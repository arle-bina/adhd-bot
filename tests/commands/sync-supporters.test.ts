import { describe, expect, it } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data } from "../../src/commands/sync-supporters.js";
import { feedTierToRoleTier } from "../../src/commands/supporter.js";

describe("/sync-supporters", () => {
  it("is a dry-run-first admin guild command", () => {
    const json = data.toJSON();
    expect(json.name).toBe("sync-supporters");
    expect(json.dm_permission).toBe(false);
    expect(BigInt(json.default_member_permissions ?? "0")).toBe(
      PermissionFlagsBits.ManageRoles,
    );

    const options = json.options ?? [];
    const apply = options.find((opt) => opt.name === "apply");
    expect(apply).toMatchObject({ required: false, type: 5 });
  });

  it("maps every game feed tier onto a role tier", () => {
    expect(feedTierToRoleTier("supporter")).toBe("regular");
    expect(feedTierToRoleTier("supporter-plus")).toBe("plus");
    // Top game tier also grants the plus Discord role, never regular.
    expect(feedTierToRoleTier("supporter-plus-plus")).toBe("plus");
  });
});
