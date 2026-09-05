import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PermissionsBitField } from "discord.js";
import { badgesFor, resolveMember } from "../../src/utils/badges.js";
import type { GuildMember, Guild } from "discord.js";

const MOD = "role-mod";
const SUPPORTER = "role-supporter";
const SUPPORTER_PLUS = "role-supporter-plus";

/** Minimal stand-in for a GuildMember: roles it holds and whether it's admin. */
function member(roleIds: string[], admin = false): GuildMember {
  return {
    permissions: { has: (flag: bigint) => admin && flag === PermissionsBitField.Flags.Administrator },
    roles: { cache: { has: (id: string) => roleIds.includes(id) } },
  } as unknown as GuildMember;
}

const ENV_KEYS = ["SERVER_MODERATOR_ID", "SUPPORTER_ROLE_ID", "SUPPORTER_PLUS_ROLE_ID"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.SERVER_MODERATOR_ID = MOD;
  process.env.SUPPORTER_ROLE_ID = SUPPORTER;
  process.env.SUPPORTER_PLUS_ROLE_ID = SUPPORTER_PLUS;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("badgesFor", () => {
  it("gives a plain member no badges", () => {
    expect(badgesFor(member([]))).toEqual([]);
  });

  it("reads supporter and moderator from their configured roles", () => {
    expect(badgesFor(member([SUPPORTER])).map((b) => b.kind)).toEqual(["supporter"]);
    expect(badgesFor(member([MOD])).map((b) => b.kind)).toEqual(["moderator"]);
  });

  it("reads admin from the permission, not a role id", () => {
    expect(badgesFor(member([], true)).map((b) => b.kind)).toEqual(["admin"]);
  });

  it("shows only the higher tier when a member holds both supporter roles", () => {
    // /supporter removes the old role after adding the new one, so a member can
    // briefly hold both. Two overlapping chips would be wrong either way.
    const kinds = badgesFor(member([SUPPORTER, SUPPORTER_PLUS])).map((b) => b.kind);
    expect(kinds).toEqual(["supporterPlus"]);
  });

  it("orders badges most significant first", () => {
    const kinds = badgesFor(member([SUPPORTER, MOD], true)).map((b) => b.kind);
    expect(kinds).toEqual(["admin", "moderator", "supporter"]);
  });

  it("awards nothing when the roles are not configured", () => {
    for (const k of ENV_KEYS) delete process.env[k];
    expect(badgesFor(member([SUPPORTER, MOD]))).toEqual([]);
  });

  it("handles a missing member without throwing", () => {
    expect(badgesFor(null)).toEqual([]);
    expect(badgesFor(undefined)).toEqual([]);
  });
});

describe("resolveMember", () => {
  const target = member([SUPPORTER]);

  function guild(overrides: Partial<{ fetch: unknown }>): Guild {
    return { members: { fetch: overrides.fetch } } as unknown as Guild;
  }

  it("fetches directly when a Discord id is known", async () => {
    const g = guild({ fetch: async (id: string) => (id === "123" ? target : null) });
    expect(await resolveMember(g, { discordId: "123" })).toBe(target);
  });

  it("returns null rather than throwing when the fetch fails", async () => {
    const g = guild({ fetch: async () => { throw new Error("unknown member"); } });
    expect(await resolveMember(g, { discordId: "123" })).toBeNull();
  });

  it("falls back to an exact username search when only a username is known", async () => {
    const found = new Map([["1", { ...target, user: { username: "eleanor" } }]]);
    const g = guild({ fetch: async () => Object.assign(found, { find: (fn: (m: unknown) => boolean) => [...found.values()].find(fn) }) });
    const out = await resolveMember(g, { discordUsername: "eleanor" });
    expect(out).not.toBeNull();
  });

  it("refuses a near-miss on the username", async () => {
    // A prefix search returns several members; badging the wrong player is
    // worse than badging nobody.
    const found = new Map([["1", { ...target, user: { username: "eleanor_vance_2" } }]]);
    const g = guild({ fetch: async () => Object.assign(found, { find: (fn: (m: unknown) => boolean) => [...found.values()].find(fn) }) });
    expect(await resolveMember(g, { discordUsername: "eleanor" })).toBeNull();
  });

  it("returns null with no guild, no id and no username", async () => {
    expect(await resolveMember(null, { discordId: "123" })).toBeNull();
    expect(await resolveMember(guild({ fetch: async () => target }), {})).toBeNull();
    expect(await resolveMember(guild({ fetch: async () => target }), { discordUsername: "   " })).toBeNull();
  });
});
