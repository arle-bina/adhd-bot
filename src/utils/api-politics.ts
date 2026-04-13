// Politics-domain API: characters, elections, parties, government, sync-roles.

import { apiFetch } from "./api-base.js";

// ---------------------------------------------------------------------------
// Character Lookup
// ---------------------------------------------------------------------------

export interface CharacterResult {
  id: string;
  name: string;
  bio: string | null;
  party: string;
  partyId: string | null;
  partyColor: string | null;
  partyUrl: string | null;
  state: string;
  stateCode: string | null;
  stateUrl: string | null;
  countryId: string | null;
  countryUrl: string | null;
  position: string;
  officeType: string | null;
  politicalInfluence: number;
  nationalInfluence: number;
  favorability: number;
  infamy: number;
  funds: number;
  actions: number;
  donorBaseLevel: number | null;
  policies: { economic: number; social: number } | null;
  avatarUrl: string | null;
  discordAvatarUrl: string | null;
  discordUsername: string | null;
  profileUrl: string;
  createdAt: string | null;
  activeElection: {
    electionId: string;
    electionType: string;
    electionState: string;
    enteredAt: string;
  } | null;
  isCeo: boolean;
  ceoOf: string | null;
  isInvestor: boolean;
  portfolioValue: number | null;
  investorRank: 1 | 2 | 3 | null;
}

export interface LookupResponse {
  found: boolean;
  characters: CharacterResult[];
}

// Handle both { found, characters } and { success, data/characters/results } shapes
function normalizeLookupResponse(raw: Record<string, unknown>): LookupResponse {
  const found = raw.found ?? raw.success ?? false;
  const characters = raw.characters ?? raw.data ?? raw.results ?? [];

  if (!Array.isArray(characters)) {
    console.error("Lookup API returned unexpected shape:", JSON.stringify(raw).slice(0, 500));
    return { found: false, characters: [] };
  }

  return { found: Boolean(found), characters: characters as CharacterResult[] };
}

export async function lookupByName(name: string): Promise<LookupResponse> {
  const raw = await apiFetch<Record<string, unknown>>("/api/discord-bot/lookup", { name });
  return normalizeLookupResponse(raw);
}

export async function lookupByDiscordId(discordId: string): Promise<LookupResponse> {
  const raw = await apiFetch<Record<string, unknown>>("/api/discord-bot/lookup", { discordId });
  return normalizeLookupResponse(raw);
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export interface LeaderboardCharacter {
  rank: number;
  id: string;
  name: string;
  party: string;
  partyColor: string;
  stateCode: string;
  position: string;
  politicalInfluence: number;
  nationalPoliticalInfluence: number;
  favorability: number;
  actions: number;
  funds: number;
  profileUrl: string;
}

export type LeaderboardMetric = "politicalInfluence" | "nationalPoliticalInfluence" | "favorability" | "actions" | "funds";

interface LeaderboardResponse {
  found: boolean;
  metric: LeaderboardMetric;
  characters: LeaderboardCharacter[];
}

export async function getLeaderboard(params: {
  metric?: string;
  country?: string;
  limit?: number;
}): Promise<LeaderboardResponse> {
  const p: Record<string, string> = {};
  if (params.metric) p.metric = params.metric;
  if (params.country) p.country = params.country;
  if (params.limit != null) p.limit = String(params.limit);
  return apiFetch<LeaderboardResponse>("/api/discord-bot/leaderboard", p);
}

// ---------------------------------------------------------------------------
// Party
// ---------------------------------------------------------------------------

interface PartyTopMember {
  id: string;
  name: string;
  position: string;
  politicalInfluence: number;
  profileUrl: string;
}

interface PartyData {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  economicPosition: number;
  socialPosition: number;
  memberCount: number;
  treasury: number;
  chairName: string | null;
  partyUrl: string;
  topMembers: PartyTopMember[];
}

interface PartyResponse {
  found: boolean;
  party?: PartyData;
}

export async function getParty(id: string, country: string): Promise<PartyResponse> {
  return apiFetch<PartyResponse>("/api/discord-bot/party", { id, country });
}

// ---------------------------------------------------------------------------
// Elections
// ---------------------------------------------------------------------------

export interface ElectionCandidate {
  characterId: string;
  characterName: string;
  party: string;
  partyColor: string;
  profileUrl?: string | null;
}

export interface Election {
  id: string;
  seatId: string | null;
  electionType: string;
  state: string;
  status: "upcoming" | "active";
  startTime: string | null;
  endTime: string | null;
  candidates: ElectionCandidate[];
}

interface ElectionsResponse {
  found: boolean;
  elections: Election[];
}

export async function getElections(params: {
  country?: string;
  state?: string;
}): Promise<ElectionsResponse> {
  const p: Record<string, string> = {};
  if (params.country) p.country = params.country;
  if (params.state) p.state = params.state;
  return apiFetch<ElectionsResponse>("/api/discord-bot/elections", p);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface StateOfficial {
  officeType: string;
  characterId: string | null;
  characterName: string | null;
  party: string | null;
  partyColor: string;
  isNPP: boolean;
  profileUrl?: string | null;
}

interface StateData {
  id: string;
  name: string;
  region: string;
  population: number;
  votingSystem: "fptp" | "rcv";
  stateUrl: string;
  officials: StateOfficial[];
}

interface StateResponse {
  found: boolean;
  state?: StateData;
}

export async function getState(id: string): Promise<StateResponse> {
  return apiFetch<StateResponse>("/api/discord-bot/state", { id });
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

interface NewsPost {
  id: string;
  title: string | null;
  content: string;
  authorName: string;
  isSystem: boolean;
  category: "election" | "legislation" | "executive" | "general" | null;
  stateId: string | null;
  reactions: { agree: number; disagree: number };
  createdAt: string;
  postUrl: string;
}

interface NewsResponse {
  found: boolean;
  posts: NewsPost[];
}

export async function getNews(params: {
  category?: string;
  limit?: number;
}): Promise<NewsResponse> {
  const p: Record<string, string> = {};
  if (params.category) p.category = params.category;
  if (params.limit != null) p.limit = String(params.limit);
  return apiFetch<NewsResponse>("/api/discord-bot/news", p);
}

// ---------------------------------------------------------------------------
// Career
// ---------------------------------------------------------------------------

export interface CareerEvent {
  type: "elected" | "lost_election" | "resigned" | "appointed" | "removed";
  office: string;
  officeRaw: { type: string; state: string };
  party: string;
  electionId: string | null;
  date: string;
}

interface CareerResponse {
  found: boolean;
  characterId: string;
  characterName: string;
  career: CareerEvent[];
}

export async function getCareer(params: {
  characterId?: string;
  discordId?: string;
  name?: string;
}): Promise<CareerResponse> {
  const p: Record<string, string> = {};
  if (params.characterId) p.characterId = params.characterId;
  if (params.discordId) p.discordId = params.discordId;
  if (params.name) p.name = params.name;
  return apiFetch<CareerResponse>("/api/discord-bot/career", p);
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "milestone" | "election" | "legislation" | "social" | "action" | "special";
  isHidden: boolean;
  isHighlighted: boolean;
  earnedAt: string;
}

interface AchievementsResponse {
  found: boolean;
  characterId: string;
  characterName: string;
  achievements: Achievement[];
}

export async function getAchievements(params: {
  characterId?: string;
  discordId?: string;
  name?: string;
}): Promise<AchievementsResponse> {
  const p: Record<string, string> = {};
  if (params.characterId) p.characterId = params.characterId;
  if (params.discordId) p.discordId = params.discordId;
  if (params.name) p.name = params.name;
  return apiFetch<AchievementsResponse>("/api/discord-bot/achievements", p);
}

// ---------------------------------------------------------------------------
// Race Detail
// ---------------------------------------------------------------------------

export interface RaceEndorsement {
  type: string;
  name: string;
}

export interface RaceCandidate {
  id: string;
  characterId: string;
  characterName: string;
  avatarUrl: string | null;
  party: string;
  partyId: string;
  partyColor: string;
  isNPP: boolean;
  favorability: number;
  politicalInfluence: number;
  economicPosition: number;
  socialPosition: number;
  primaryScore: number;
  sharePct: number;
  endorsementCount: number;
  endorsements: RaceEndorsement[];
  runningMateName: string | null;
  campaignFunds: number;
  profileUrl: string;
}

export interface RaceVoteSnapshot {
  turn: number;
  cumulativeVotes: Record<string, number>;
  sharesPct: Record<string, number>;
}

export interface RaceVotes {
  totalVotes: number;
  candidateNames: Record<string, string>;
  candidateParties: Record<string, string>;
  finalized: boolean;
  seatsEstimate: number | null;
  electoralVotes?: Record<string, number>;
  latestSnapshot: RaceVoteSnapshot | null;
}

export interface RaceElection {
  id: string;
  seatId: string | null;
  electionType: string;
  state: string;
  stateName: string;
  countryId: string;
  cycle: number;
  status: string;
  totalSeats: number;
  startTime: string | null;
  endTime: string | null;
  primaryEndTime: string | null;
  url: string;
}

export interface RacePhase {
  inPrimary: boolean;
  inGeneral: boolean;
  isUpcoming: boolean;
  isEnded: boolean;
}

export interface RaceIncumbent {
  name: string;
  party: string;
}

export interface RaceDetailResponse {
  found: boolean;
  mode: "detail";
  election: RaceElection;
  phase: RacePhase;
  incumbent: RaceIncumbent | null;
  candidates: RaceCandidate[];
  primarySnapshots: unknown[];
  votes: RaceVotes;
  gameState: { currentTurn: number; isActive: boolean };
}

interface RaceListResponse {
  found: boolean;
  mode: "list";
  elections: Array<{
    id: string;
    seatId: string | null;
    electionType: string;
    state: string;
    stateName: string;
    status: string;
    startTime: string | null;
    endTime: string | null;
  }>;
}

interface RaceNotFoundResponse {
  found: false;
  mode?: undefined;
}

export type RaceResponse = RaceDetailResponse | RaceListResponse | RaceNotFoundResponse;

export async function getRace(params: {
  country?: string;
  state?: string;
  race?: string;
  electionId?: string;
}): Promise<RaceResponse> {
  const p: Record<string, string> = {};
  if (params.country) p.country = params.country;
  if (params.state) p.state = params.state;
  if (params.race) p.race = params.race;
  if (params.electionId) p.electionId = params.electionId;
  return apiFetch<RaceResponse>("/api/discord-bot/race", p);
}

// ---------------------------------------------------------------------------
// Predict
// ---------------------------------------------------------------------------

export interface PredictionPartyEntry {
  party: string;
  partyName: string;
  partyColor: string | null;
  seats: number;
}

export interface PredictionResponse {
  found: true;
  country: string;
  countryName: string;
  race: string;
  chamberName: string;
  totalSeats: number;
  inGeneral: boolean;
  activeSenateClass?: number | null;
  cycle?: number | null;
  current: PredictionPartyEntry[];
  projected: PredictionPartyEntry[];
}

export async function getPrediction(params: {
  country: string;
  race: string;
}): Promise<PredictionResponse> {
  return apiFetch<PredictionResponse>("/api/discord-bot/predict", {
    country: params.country,
    race: params.race,
  });
}

// ---------------------------------------------------------------------------
// Government
// ---------------------------------------------------------------------------

export interface GovernmentOfficial {
  role: string;
  section: "executive" | "leadership" | "cabinet";
  characterId: string | null;
  characterName: string | null;
  party: string | null;
  partyColor: string;
  profileUrl: string | null;
  isNPP: boolean;
}

export interface GovernmentResponse {
  found: boolean;
  country: string;
  countryName: string;
  officials: GovernmentOfficial[];
}

export async function getGovernment(country?: string): Promise<GovernmentResponse> {
  const p: Record<string, string> = {};
  if (country) p.country = country;
  return apiFetch<GovernmentResponse>("/api/discord-bot/government", p);
}

// ---------------------------------------------------------------------------
// Sync Roles
// ---------------------------------------------------------------------------

export interface SyncRolesDetails {
  partyName: string;
  partyColor: string | null;
  officeName: string | null;
}

export interface SyncRolesResponse {
  found: boolean;
  roles: string[];
  details: SyncRolesDetails;
}

export async function getSyncRoles(discordId: string): Promise<SyncRolesResponse> {
  return apiFetch<SyncRolesResponse>("/api/discord-bot/sync-roles", { discordId });
}
