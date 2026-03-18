import { GuildMember, Guild } from "discord.js";

const COUNTRY_ROLES: Record<string, { name: string; color: number }> = {
  US: { name: "United States", color: 0x3c5a9a },
  UK: { name: "United Kingdom", color: 0x9a3c3c },
};

// Names of roles this bot manages — never treated as stale party roles
const MANAGED_NON_PARTY_NAMES = new Set(
  Object.values(COUNTRY_ROLES).map((r) => r.name)
);

async function getOrCreateRole(guild: Guild, name: string, color: number): Promise<string> {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing.id;
  const created = await guild.roles.create({ name, color, reason: "AHD Bot — auto party/country role" });
  return created.id;
}

export interface CharForSync {
  party: string;
  partyColor: string;
  countryId: string;
}

export async function syncMemberRoles(member: GuildMember, char: CharForSync): Promise<void> {
  const guild = member.guild;
  const partyColorInt = parseInt(char.partyColor.replace("#", ""), 16);
  const country = COUNTRY_ROLES[char.countryId];

  // Ensure roles exist
  const partyRoleId = await getOrCreateRole(guild, char.party, partyColorInt);
  const countryRoleId = country ? await getOrCreateRole(guild, country.name, country.color) : null;

  // Build exclusion set — roles we must never remove
  const keep = new Set<string>([
    guild.roles.everyone.id,
    process.env.MEMBER_ROLE_ID!,
    partyRoleId,
    ...(countryRoleId ? [countryRoleId] : []),
  ]);

  // Remove stale party roles: colored, non-managed, non-kept, non-Discord-managed
  const stale = member.roles.cache.filter(
    (r) =>
      !keep.has(r.id) &&
      !r.managed &&
      r.color !== 0 &&
      !MANAGED_NON_PARTY_NAMES.has(r.name)
  );

  for (const [id] of stale) {
    await member.roles.remove(id).catch(() => {});
  }

  // Add correct roles
  await member.roles.add(partyRoleId);
  if (countryRoleId) await member.roles.add(countryRoleId);
}
