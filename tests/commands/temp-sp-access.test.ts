import { describe, expect, it } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data } from "../../src/commands/temp-sp-access.js";

describe("/temp-sp-access", () => {
  it("is an admin guild command that tags a user", () => {
    const json = data.toJSON();
    expect(json.name).toBe("temp-sp-access");
    expect(json.dm_permission).toBe(false);
    expect(BigInt(json.default_member_permissions ?? "0")).toBe(
      PermissionFlagsBits.ManageRoles,
    );

    const options = json.options ?? [];
    const user = options.find((opt) => opt.name === "user");
    const days = options.find((opt) => opt.name === "days");
    expect(user).toMatchObject({ required: true, type: 6 });
    expect(days).toMatchObject({
      required: false,
      type: 4,
      min_value: 1,
      max_value: 90,
    });
  });
});
