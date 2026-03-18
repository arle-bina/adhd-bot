import { GuildMember, Guild } from "discord.js";

const COUNTRY_ROLES: Record<string, { name: string; color: number }> = {
  US: { name: "United States", color: 0x3c5a9a },
  UK: { name: "United Kingdom", color: 0x9a3c3c },
};

// Names of roles this bot manages — never treated as stale party roles
const MANAGED_NON_PARTY_NAMES = new Set([
  ...Object.values(COUNTRY_ROLES).map((r) => r.name),
  "CEO",
  "Investor",
  "Investor Rank 1",
  "Investor Rank 2",
  "Investor Rank 3",
]);

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

const CEO_ROLE = { name: "CEO", color: 0xe6c200 };
const INVESTOR_ROLE = { name: "Investor", color: 0x2ecc71 };
const INVESTOR_RANK_ROLES: { name: string; color: number }[] = [
  { name: "Investor Rank 1", color: 0x2ecc71 },
  { name: "Investor Rank 2", color: 0x27ae60 },
  { name: "Investor Rank 3", color: 0x1e8449 },
];

export async function syncMemberRoles(member: GuildMember, char: CharForSync): Promise<void> {
  const guild = member.guild;
  const partyColorInt = char.partyColor ? parseInt(char.partyColor.replace("#", ""), 16) : 0x5865f2;
  const country = char.countryId ? COUNTRY_ROLES[char.countryId] : undefined;

  // Ensure party + country roles exist
  const partyRoleId = await getOrCreateRole(guild, char.party, partyColorInt);
  const countryRoleId = country ? await getOrCreateRole(guild, country.name, country.color) : null;

  // Ensure CEO, investor, and ranked investor roles exist (create if missing)
  const ceoRoleId = await getOrCreateRole(guild, CEO_ROLE.name, CEO_ROLE.color);
  const investorRoleId = await getOrCreateRole(guild, INVESTOR_ROLE.name, INVESTOR_ROLE.color);
  const rankRoleIds = await Promise.all(
    INVESTOR_RANK_ROLES.map((r) => getOrCreateRole(guild, r.name, r.color))
  );

  // Build exclusion set — roles we must never strip as "stale party" roles
  const keep = new Set<string>([
    guild.roles.everyone.id,
    process.env.MEMBER_ROLE_ID!,
    process.env.ALPHA_TESTER_ROLE_ID!,
    partyRoleId,
    ...(countryRoleId ? [countryRoleId] : []),
    ceoRoleId,
    investorRoleId,
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
  if (char.isCeo) await member.roles.add(ceoRoleId).catch(() => {});
  else await member.roles.remove(ceoRoleId).catch(() => {});

  // Investor role
  if (char.isInvestor) await member.roles.add(investorRoleId).catch(() => {});
  else await member.roles.remove(investorRoleId).catch(() => {});

  // Ranked investor roles — always remove all 3, then assign the correct one
  for (const id of rankRoleIds) {
    await member.roles.remove(id).catch(() => {});
  }
  if (char.investorRank) {
    const rankId = rankRoleIds[char.investorRank - 1];
    if (rankId) await member.roles.add(rankId).catch(() => {});
  }
}
