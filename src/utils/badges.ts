/**
 * Standing badges for a player — supporter tier, moderator, admin.
 *
 * The source of truth is Discord roles, not the game database: `/supporter`
 * grants and revokes `SUPPORTER_ROLE_ID` / `SUPPORTER_PLUS_ROLE_ID` on the
 * member, and moderation is a role too. Reading the member keeps this in step
 * with whatever `/supporter` last did, with no second store to drift.
 */

import { PermissionsBitField, type Guild, type GuildMember } from "discord.js";

export type BadgeKind = "admin" | "moderator" | "supporterPlus" | "supporter";

export interface Badge {
  kind: BadgeKind;
  label: string;
  /** Chip colour on the card. */
  color: string;
}

/**
 * Ordered most significant first, and mutually exclusive within a tier:
 * `supporterPlus` suppresses `supporter`, because holding both roles during a
 * `/supporter` upgrade would otherwise render two overlapping chips.
 */
const DEFINITIONS: Array<{ kind: BadgeKind; label: string; color: string; env?: string }> = [
  { kind: "admin", label: "ADMIN", color: "#dc2626" },
  { kind: "moderator", label: "MOD", color: "#3b82f6", env: "SERVER_MODERATOR_ID" },
  { kind: "supporterPlus", label: "SUPPORTER++", color: "#d4af37", env: "SUPPORTER_PLUS_ROLE_ID" },
  { kind: "supporter", label: "SUPPORTER", color: "#22c55e", env: "SUPPORTER_ROLE_ID" },
];

/** Resolve the badges a member is entitled to. Empty for a plain member. */
export function badgesFor(member: GuildMember | null | undefined): Badge[] {
  if (!member) return [];

  const out: Badge[] = [];
  for (const def of DEFINITIONS) {
    if (def.kind === "admin") {
      if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        out.push({ kind: def.kind, label: def.label, color: def.color });
      }
      continue;
    }
    const roleId = def.env ? process.env[def.env] : undefined;
    if (roleId && member.roles.cache.has(roleId)) {
      out.push({ kind: def.kind, label: def.label, color: def.color });
    }
  }

  // A member mid-upgrade can hold both supporter roles; show only the higher.
  if (out.some((b) => b.kind === "supporterPlus")) {
    return out.filter((b) => b.kind !== "supporter");
  }
  return out;
}

/**
 * Find the guild member behind a looked-up character.
 *
 * `/profile` reaches its subject three ways and only two of them carry a
 * Discord identity, so this takes what it can get:
 *
 *   - `/profile`            → the caller, whose id we have
 *   - `/profile user:@x`    → that user's id
 *   - `/profile name:X`     → only `discordUsername` from the game API, which
 *                             does not return a Discord id
 *
 * The last case falls back to a bounded server-side member search on the exact
 * username. Never throws and never blocks the reply: a profile that cannot
 * resolve a member simply shows no badges.
 */
export async function resolveMember(
  guild: Guild | null | undefined,
  opts: { discordId?: string | null; discordUsername?: string | null },
): Promise<GuildMember | null> {
  if (!guild) return null;

  if (opts.discordId) {
    return guild.members.fetch(opts.discordId).catch(() => null);
  }

  const username = opts.discordUsername?.trim();
  if (!username) return null;

  try {
    const found = await guild.members.fetch({ query: username, limit: 5 });
    // Match the exact username; a prefix search can return several members and
    // badging the wrong player is worse than badging nobody.
    return found.find((m) => m.user.username.toLowerCase() === username.toLowerCase()) ?? null;
  } catch {
    return null;
  }
}
