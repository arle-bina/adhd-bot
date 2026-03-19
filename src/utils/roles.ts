import { GuildMember, Guild } from "discord.js";
import type { SyncRolesDetails } from "./api.js";

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  UK: "United Kingdom",
};

const COUNTRY_COLORS: Record<string, number> = {
  US: 0x3c5a9a,
  UK: 0x9a3c3c,
};

const OFFICE_COLOR = 0xe67e22;
const CEO_COLOR = 0xf1c40f;
const INVESTOR_COLOR = 0x2ecc71;
const INVESTOR_RANK_COLORS: Record<string, number> = {
  "1": 0xe6ac00,
  "2": 0xc0c0c0,
  "3": 0xcd7f32,
};

/** Convert a role string from the API into a Discord role name and color. */
function resolveRole(
  role: string,
  details: SyncRolesDetails,
): { name: string; color: number } | null {
  if (role === "ceo") return { name: "CEO", color: CEO_COLOR };
  if (role === "investor") return { name: "Investor", color: INVESTOR_COLOR };

  if (role.startsWith("investor:")) {
    const rank = role.split(":")[1];
    return { name: `#${rank} Investor`, color: INVESTOR_RANK_COLORS[rank] ?? INVESTOR_COLOR };
  }

  if (role.startsWith("office:")) {
    const officeName = role.split(":").slice(1).join(":");
    return { name: officeName, color: OFFICE_COLOR };
  }

  if (role.startsWith("party:")) {
    const partyColor = details.partyColor
      ? parseInt(details.partyColor.replace("#", ""), 16)
      : 0x5865f2;
    return { name: details.partyName, color: partyColor };
  }

  if (role.startsWith("country:")) {
    const code = role.split(":")[1];
    const name = COUNTRY_NAMES[code];
    if (!name) return null;
    return { name, color: COUNTRY_COLORS[code] ?? 0x5865f2 };
  }

  return null;
}

async function getOrCreateRole(guild: Guild, name: string, color: number): Promise<string> {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing.id;
  const created = await guild.roles.create({ name, color, reason: "AHD Bot — auto role" });
  return created.id;
}

/**
 * Sync a member's Discord roles based on the roles array from the sync-roles API.
 * The `roles` array is treated as the complete set of bot-managed roles.
 */
export async function syncMemberRoles(
  member: GuildMember,
  roles: string[],
  details: SyncRolesDetails,
): Promise<void> {
  const guild = member.guild;

  // Resolve every API role string to a Discord role name + color
  const desired: { name: string; color: number }[] = [];
  for (const role of roles) {
    const resolved = resolveRole(role, details);
    if (resolved) desired.push(resolved);
  }

  // Ensure all desired roles exist and collect their IDs
  const desiredIds = new Set<string>();
  for (const { name, color } of desired) {
    const id = await getOrCreateRole(guild, name, color);
    desiredIds.add(id);
  }

  // Build the set of all role names this bot could manage
  const allManagedNames = new Set<string>([
    ...Object.values(COUNTRY_NAMES),
    "CEO",
    "Investor",
    "#1 Investor",
    "#2 Investor",
    "#3 Investor",
  ]);

  // Protected role IDs that should never be removed
  const protectedIds = new Set<string>([
    guild.roles.everyone.id,
    ...(process.env.MEMBER_ROLE_ID ? [process.env.MEMBER_ROLE_ID] : []),
    ...(process.env.ALPHA_TESTER_ROLE_ID ? [process.env.ALPHA_TESTER_ROLE_ID] : []),
  ]);

  // Remove tracked roles that are absent from the desired set
  for (const [id, role] of member.roles.cache) {
    if (protectedIds.has(id)) continue;
    if (desiredIds.has(id)) continue;
    if (role.managed) continue;

    // A role is "tracked" if it matches a known managed name OR has a non-default color
    // (colored roles are likely party/office roles the bot created)
    const isTracked = allManagedNames.has(role.name) || role.color !== 0;
    if (isTracked) {
      await member.roles.remove(id).catch(() => {});
    }
  }

  // Add all desired roles
  for (const id of desiredIds) {
    if (!member.roles.cache.has(id)) {
      await member.roles.add(id).catch(() => {});
    }
  }
}
