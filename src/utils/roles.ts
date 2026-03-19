import { GuildMember, Guild } from "discord.js";

const COUNTRY_ROLES: Record<string, { name: string; color: number }> = {
  US: { name: "United States", color: 0x3c5a9a },
  UK: { name: "United Kingdom", color: 0x9a3c3c },
};

// Role names/colors for auto-created special roles
const CEO_ROLE = { name: "CEO", color: 0xf1c40f };
const INVESTOR_ROLE = { name: "Investor", color: 0x2ecc71 };
const INVESTOR_RANK_ROLES: Record<number, { name: string; color: number }> = {
  1: { name: "Top Investor", color: 0xe6ac00 },
  2: { name: "#2 Investor", color: 0xc0c0c0 },
  3: { name: "#3 Investor", color: 0xcd7f32 },
};

// All role names the bot manages — never treated as stale party roles
const MANAGED_NON_PARTY_NAMES = new Set([
  ...Object.values(COUNTRY_ROLES).map((r) => r.name),
  CEO_ROLE.name,
  INVESTOR_ROLE.name,
  ...Object.values(INVESTOR_RANK_ROLES).map((r) => r.name),
]);

async function getOrCreateRole(guild: Guild, name: string, color: number): Promise<string> {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing.id;
  const created = await guild.roles.create({ name, color, reason: "AHD Bot — auto role" });
  return created.id;
}

export interface SyncDetails {
  party: string;
  partyName: string;
  partyColor?: string | null;
  country: string;
  office?: string | null;
  isCeo: boolean;
  isInvestor: boolean;
  investorRank?: 1 | 2 | 3 | null;
}

export interface CharForSync {
  party: string;
  partyColor: string | null;
  countryId: string | null;
  isCeo: boolean;
  isInvestor: boolean;
  investorRank: 1 | 2 | 3 | null;
}

/**
 * Sync a member's Discord roles based on their game character data.
 * Accepts either the new SyncDetails format or the legacy CharForSync format.
 */
export async function syncMemberRoles(
  member: GuildMember,
  char: CharForSync | SyncDetails,
): Promise<void> {
  const guild = member.guild;

  // Normalize to a common shape
  const partyName = "partyName" in char ? char.partyName : char.party;
  const partyColorRaw = "partyColor" in char ? char.partyColor : null;
  const partyColorInt = partyColorRaw ? parseInt(partyColorRaw.replace("#", ""), 16) : 0x5865f2;
  const countryCode = "country" in char ? char.country : char.countryId;
  const country = countryCode ? COUNTRY_ROLES[countryCode] : undefined;
  const isCeo = char.isCeo;
  const isInvestor = char.isInvestor;
  const investorRank = char.investorRank ?? null;

  // Ensure party + country roles exist
  const partyRoleId = await getOrCreateRole(guild, partyName, partyColorInt);
  const countryRoleId = country ? await getOrCreateRole(guild, country.name, country.color) : null;

  // Auto-create CEO and investor roles as needed
  const ceoRoleId = isCeo ? await getOrCreateRole(guild, CEO_ROLE.name, CEO_ROLE.color) : null;
  const investorRoleId = isInvestor ? await getOrCreateRole(guild, INVESTOR_ROLE.name, INVESTOR_ROLE.color) : null;
  const investorRankRoleId = investorRank
    ? await getOrCreateRole(guild, INVESTOR_RANK_ROLES[investorRank].name, INVESTOR_RANK_ROLES[investorRank].color)
    : null;

  // Resolve existing CEO/investor role IDs for the keep set (even if this user doesn't have them)
  const findRole = (name: string) => guild.roles.cache.find((r) => r.name === name)?.id;
  const existingCeoRoleId = findRole(CEO_ROLE.name);
  const existingInvestorRoleId = findRole(INVESTOR_ROLE.name);
  const existingRankRoleIds = Object.values(INVESTOR_RANK_ROLES)
    .map((r) => findRole(r.name))
    .filter(Boolean) as string[];

  // Build exclusion set — roles we must never strip as "stale party" roles
  const keep = new Set<string>([
    guild.roles.everyone.id,
    ...(process.env.MEMBER_ROLE_ID ? [process.env.MEMBER_ROLE_ID] : []),
    ...(process.env.ALPHA_TESTER_ROLE_ID ? [process.env.ALPHA_TESTER_ROLE_ID] : []),
    partyRoleId,
    ...(countryRoleId ? [countryRoleId] : []),
    ...(existingCeoRoleId ? [existingCeoRoleId] : []),
    ...(existingInvestorRoleId ? [existingInvestorRoleId] : []),
    ...existingRankRoleIds,
  ]);

  // Remove stale party roles: colored, non-managed, non-kept
  const stale = member.roles.cache.filter(
    (r) =>
      !keep.has(r.id) &&
      !r.managed &&
      r.color !== 0 &&
      !MANAGED_NON_PARTY_NAMES.has(r.name),
  );
  for (const [id] of stale) {
    await member.roles.remove(id).catch(() => {});
  }

  // Add correct party + country roles
  await member.roles.add(partyRoleId);
  if (countryRoleId) await member.roles.add(countryRoleId);

  // CEO role — auto-create when needed, remove when not
  if (isCeo && ceoRoleId) {
    await member.roles.add(ceoRoleId).catch(() => {});
  } else if (existingCeoRoleId) {
    await member.roles.remove(existingCeoRoleId).catch(() => {});
  }

  // Investor role — auto-create when needed, remove when not
  if (isInvestor && investorRoleId) {
    await member.roles.add(investorRoleId).catch(() => {});
  } else if (existingInvestorRoleId) {
    await member.roles.remove(existingInvestorRoleId).catch(() => {});
  }

  // Ranked investor roles — remove all 3, then assign the correct one
  for (const id of existingRankRoleIds) {
    await member.roles.remove(id).catch(() => {});
  }
  if (investorRank && investorRankRoleId) {
    await member.roles.add(investorRankRoleId).catch(() => {});
  }
}
