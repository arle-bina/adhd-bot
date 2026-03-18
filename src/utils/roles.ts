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
  partyColor: string | null;
  countryId: string | null;
  isCeo: boolean;
  isInvestor: boolean;
  investorRank: 1 | 2 | 3 | null;
}

const INVESTOR_RANK_VARS = [
  "INVESTOR_RANK_1_ROLE_ID",
  "INVESTOR_RANK_2_ROLE_ID",
  "INVESTOR_RANK_3_ROLE_ID",
] as const;

export async function syncMemberRoles(member: GuildMember, char: CharForSync): Promise<void> {
  const guild = member.guild;
  const partyColorInt = char.partyColor ? parseInt(char.partyColor.replace("#", ""), 16) : 0x5865f2;
  const country = char.countryId ? COUNTRY_ROLES[char.countryId] : undefined;

  // Ensure party + country roles exist
  const partyRoleId = await getOrCreateRole(guild, char.party, partyColorInt);
  const countryRoleId = country ? await getOrCreateRole(guild, country.name, country.color) : null;

  // Static role IDs from env (may be undefined if not configured)
  const ceoRoleId = process.env.CEO_ROLE_ID;
  const investorRoleId = process.env.INVESTOR_ROLE_ID;
  const rankRoleIds = INVESTOR_RANK_VARS.map((v) => process.env[v]).filter(Boolean) as string[];

  // Build exclusion set — roles we must never strip as "stale party" roles
  const keep = new Set<string>([
    guild.roles.everyone.id,
    process.env.MEMBER_ROLE_ID!,
    process.env.ALPHA_TESTER_ROLE_ID!,
    partyRoleId,
    ...(countryRoleId ? [countryRoleId] : []),
    ...(ceoRoleId ? [ceoRoleId] : []),
    ...(investorRoleId ? [investorRoleId] : []),
    ...rankRoleIds,
  ]);

  // Remove stale party roles: colored, non-managed, non-kept
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

  // Add correct party + country roles
  await member.roles.add(partyRoleId);
  if (countryRoleId) await member.roles.add(countryRoleId);

  // CEO role
  if (ceoRoleId) {
    if (char.isCeo) await member.roles.add(ceoRoleId).catch(() => {});
    else await member.roles.remove(ceoRoleId).catch(() => {});
  }

  // Investor role
  if (investorRoleId) {
    if (char.isInvestor) await member.roles.add(investorRoleId).catch(() => {});
    else await member.roles.remove(investorRoleId).catch(() => {});
  }

  // Ranked investor roles — always remove all 3, then assign the correct one
  for (const id of rankRoleIds) {
    await member.roles.remove(id).catch(() => {});
  }
  if (char.investorRank) {
    const rankId = process.env[INVESTOR_RANK_VARS[char.investorRank - 1]];
    if (rankId) await member.roles.add(rankId).catch(() => {});
  }
}
