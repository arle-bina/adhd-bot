// ---------------------------------------------------------------------------
// Custom error class that carries HTTP context for better error messages
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly responseBody: string;

  constructor(status: number, endpoint: string, responseBody: string) {
    const summary = responseBody.slice(0, 200) || "(empty response)";
    super(`API ${status} from ${endpoint}: ${summary}`);
    this.name = "ApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.responseBody = responseBody;
  }
}

async function throwApiError(response: Response, endpoint: string): Promise<never> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    body = "(could not read response body)";
  }
  throw new ApiError(response.status, endpoint, body);
}

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

function normalizeLookupResponse(raw: Record<string, unknown>): LookupResponse {
  // Handle both { found, characters } and { success, data/characters/results } shapes
  const found = raw.found ?? raw.success ?? false;
  const characters = raw.characters ?? raw.data ?? raw.results ?? [];

  if (!Array.isArray(characters)) {
    console.error("Lookup API returned unexpected shape:", JSON.stringify(raw).slice(0, 500));
    return { found: false, characters: [] };
  }

  return { found: Boolean(found), characters: characters as CharacterResult[] };
}

const FETCH_TIMEOUT_MS = 10_000;

export async function lookupByName(name: string): Promise<LookupResponse> {
  const url = new URL("/api/discord-bot/lookup", process.env.GAME_API_URL);
  url.searchParams.set("name", name);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, "/api/discord-bot/lookup");

  const raw = await response.json();
  return normalizeLookupResponse(raw);
}

export async function lookupByDiscordId(discordId: string): Promise<LookupResponse> {
  const url = new URL("/api/discord-bot/lookup", process.env.GAME_API_URL);
  url.searchParams.set("discordId", discordId);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, "/api/discord-bot/lookup");

  const raw = await response.json();
  return normalizeLookupResponse(raw);
}

// --- Leaderboard ---

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
  const url = new URL("/api/discord-bot/leaderboard", process.env.GAME_API_URL);
  if (params.metric) url.searchParams.set("metric", params.metric);
  if (params.country) url.searchParams.set("country", params.country);
  if (params.limit != null) url.searchParams.set("limit", String(params.limit));

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- Party ---

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
  const url = new URL("/api/discord-bot/party", process.env.GAME_API_URL);
  url.searchParams.set("id", id);
  url.searchParams.set("country", country);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- Elections ---

export interface ElectionCandidate {
  characterId: string;
  characterName: string;
  party: string;
  partyColor: string;
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
  const url = new URL("/api/discord-bot/elections", process.env.GAME_API_URL);
  if (params.country) url.searchParams.set("country", params.country);
  if (params.state) url.searchParams.set("state", params.state);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- State ---

interface StateOfficial {
  officeType: string;
  characterId: string | null;
  characterName: string | null;
  party: string | null;
  partyColor: string;
  isNPP: boolean;
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
  const url = new URL("/api/discord-bot/state", process.env.GAME_API_URL);
  url.searchParams.set("id", id);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- News ---

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
  const url = new URL("/api/discord-bot/news", process.env.GAME_API_URL);
  if (params.category) url.searchParams.set("category", params.category);
  if (params.limit != null) url.searchParams.set("limit", String(params.limit));

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- Turn Status ---

export interface TurnStatus {
  currentTurn: number;
  currentYear: number;
  lastTurnProcessed: string;
  nextScheduledTurn: string;
}

export async function getTurnStatus(): Promise<TurnStatus> {
  const url = new URL("/api/game/turn/status", process.env.GAME_API_URL);

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- Career ---

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
  const url = new URL("/api/discord-bot/career", process.env.GAME_API_URL);
  if (params.characterId) url.searchParams.set("characterId", params.characterId);
  if (params.discordId) url.searchParams.set("discordId", params.discordId);
  if (params.name) url.searchParams.set("name", params.name);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- Achievements ---

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
  const url = new URL("/api/discord-bot/achievements", process.env.GAME_API_URL);
  if (params.characterId) url.searchParams.set("characterId", params.characterId);
  if (params.discordId) url.searchParams.set("discordId", params.discordId);
  if (params.name) url.searchParams.set("name", params.name);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- Race Detail ---

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

// --- Predict ---

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
  const url = new URL("/api/discord-bot/predict", process.env.GAME_API_URL);
  url.searchParams.set("country", params.country);
  url.searchParams.set("race", params.race);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- Corporation ---

export interface CorporationListItem {
  id: string;
  name: string;
}

interface CorporationListResponse {
  corporations: CorporationListItem[];
}

export interface CorporationSector {
  stateId: string;
  stateName: string | null;
  revenue: number | null;
  growthRate: number | null;
  workers: number | null;
}

export interface CorporationFinancials {
  totalRevenue: number;
  maintenanceCosts: number;
  growthCosts: number;
  marketingCosts: number;
  ceoSalaryCost: number;
  totalCosts: number;
  income: number;
  operatingCosts: number;
  operatingIncome: number;
  bondInterestCost: number;
  dailyDividendPayout: number;
  retainedEarnings: number;
}

export interface CorporationCeo {
  name: string;
  profileUrl: string;
}

export interface CorporationData {
  id: string;
  sequentialId: number;
  name: string;
  description: string | null;
  type: string;
  typeLabel: string;
  brandColor: string | null;
  logoUrl: string | null;
  corpUrl: string;
  headquartersState: string;
  headquartersStateName: string;
  liquidCapital: number | null;
  sharePrice: number | null;
  totalShares: number | null;
  marketCapitalization: number | null;
  marketingBudget: number | null;
  marketingStrength: number | null;
  marketingStrengthGrowth: number | null;
  ceoSalary: number | null;
  publicFloat: number;
  publicFloatPct: number;
  dividendRate: number;
}

export interface CorporationResponse {
  found: boolean;
  corporation?: CorporationData;
  ceo?: CorporationCeo | null;
  financials?: CorporationFinancials;
  sectors?: CorporationSector[];
  shareholders?: Array<{ name: string; shares: number; percentage: number }>;
  balanceSheet?: { totalAssets: number; cashOnHand: number; sectorNPV: number; totalDebt: number; bookValue: number; totalEquity: number; marketCapitalization: number };
  creditRating?: { rating: string; compositeScore: number; effectiveCouponRate: number };
  bonds?: Array<{ id: string; couponRate: number; maturityLabel: string; totalIssued: number; marketPrice: number; turnsRemaining: number; defaulted: boolean }>;
}

export async function getCorporationList(): Promise<CorporationListResponse> {
  const url = new URL("/api/discord-bot/corporation", process.env.GAME_API_URL);
  url.searchParams.set("list", "true");

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

export async function getCorporation(name: string): Promise<CorporationResponse> {
  const url = new URL("/api/discord-bot/corporation", process.env.GAME_API_URL);
  url.searchParams.set("name", name);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- Bonds ---

export interface BondEntry {
  id: string;
  bondUrl: string;
  corporationName: string;
  corporationId: number | string;
  brandColor: string | null;
  couponRate: number;
  maturityLabel: string;
  totalIssued: number;
  totalUnits: number;
  publicFloat: number;
  marketPrice: number;
  turnsRemaining: number;
  yieldToMaturity: number;
  defaulted: boolean;
  holders: number;
}

export interface BondsResponse {
  found: boolean;
  filterCorp: string | null;
  bonds: BondEntry[];
  totalOutstandingDebt: number;
  pagination: {
    page: number;
    perPage: number;
    totalCount: number;
    totalPages: number;
  };
}

export async function getBonds(params: { corp?: string; page?: number }): Promise<BondsResponse> {
  const url = new URL("/api/discord-bot/bonds", process.env.GAME_API_URL);
  if (params.corp) url.searchParams.set("corp", params.corp);
  if (params.page != null) url.searchParams.set("page", String(params.page));
  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- Financials ---

export interface FinancialsResponse {
  found: boolean;
  corporation: {
    name: string;
    type: string;
    typeLabel: string;
    brandColor: string | null;
    logoUrl: string | null;
    headquartersStateName: string;
    ceo: string;
    corpUrl: string;
  };
  incomeStatement: {
    totalRevenue: number;
    costs: {
      maintenance: number;
      growth: number;
      marketing: number;
      ceoSalary: number;
      operatingTotal: number;
      bondInterest: number;
      grandTotal: number;
    };
    operatingIncome: number;
    netIncome: number;
    dividendRate: number;
    dailyDividendPayout: number;
    retainedEarnings: number;
  };
  balanceSheet: {
    assets: { cashOnHand: number; sectorNPV: number; totalAssets: number };
    liabilities: { outstandingDebt: number; bondCount: number; annualInterestObligation: number; dailyInterestCost: number };
    equity: { bookValue: number };
  };
  shareStructure: {
    totalShares: number;
    publicFloat: number;
    publicFloatPct: number;
    sharePrice: number;
    lastTradePrice: number;
    marketCapitalization: number;
    shareholders: Array<{ name: string; shares: number; percentage: number; value: number }>;
  };
  creditRating: {
    rating: string;
    compositeScore: number;
    components: { debtToEquity: number; interestCoverage: number; profitability: number; liquidity: number };
    effectiveCouponRate: number;
    primeRate: number;
  };
  bonds: Array<{
    id: string;
    bondUrl: string;
    couponRate: number;
    maturityLabel: string;
    totalIssued: number;
    marketPrice: number;
    turnsRemaining: number;
    yieldToMaturity: number;
    holders: number;
    defaulted: boolean;
  }>;
  sectorBreakdown: Array<{
    stateId: string;
    stateName: string;
    revenue: number;
    maintenanceCost: number;
    growthCost: number;
    profit: number;
    effectiveMargin: number;
    growthRate: number;
    workers: number;
  }>;
}

export async function getFinancials(name: string): Promise<FinancialsResponse> {
  const url = new URL("/api/discord-bot/financials", process.env.GAME_API_URL);
  url.searchParams.set("name", name);
  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- Race Detail ---

export async function getRace(params: {
  country?: string;
  state?: string;
  race?: string;
  electionId?: string;
}): Promise<RaceResponse> {
  const url = new URL("/api/discord-bot/race", process.env.GAME_API_URL);
  if (params.country) url.searchParams.set("country", params.country);
  if (params.state) url.searchParams.set("state", params.state);
  if (params.race) url.searchParams.set("race", params.race);
  if (params.electionId) url.searchParams.set("electionId", params.electionId);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- Sectors ---

export type SectorType =
  | "financial"
  | "media"
  | "manufacturing"
  | "healthcare"
  | "retail"
  | "automobiles"
  | "technology"
  | "energy"
  | "agriculture"
  | "real_estate"
  | "defense"
  | "telecommunications"
  | "entertainment"
  | "logistics"
  | "extraction";

export interface OwnedSector {
  corporationName: string;
  stateName: string;
  revenue: number;
  growthRate: number;
  workers: number;
}

export interface UnownedSector {
  stateName: string;
  unownedRevenue: number;
  totalMarket: number;
}

interface SectorsResponseBase {
  found: boolean;
  sectorLabel: string;
  page: number;
  totalPages: number;
  totalItems: number;
}

export interface OwnedSectorsResponse extends SectorsResponseBase {
  mode: "owned";
  sectors: OwnedSector[];
}

export interface UnownedSectorsResponse extends SectorsResponseBase {
  mode: "unowned";
  sectors: UnownedSector[];
}

export type SectorsResponse = OwnedSectorsResponse | UnownedSectorsResponse;

// --- Sync Roles ---

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
  const url = new URL("/api/discord-bot/sync-roles", process.env.GAME_API_URL);
  url.searchParams.set("discordId", discordId);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

export async function getSectors(params: {
  type: SectorType;
  unowned?: boolean;
  page?: number;
}): Promise<SectorsResponse> {
  const url = new URL("/api/discord-bot/sectors", process.env.GAME_API_URL);
  url.searchParams.set("type", params.type);
  if (params.unowned != null) url.searchParams.set("unowned", String(params.unowned));
  if (params.page != null) url.searchParams.set("page", String(params.page));

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- Stock Exchange (public, no auth) ---

export interface StockListing {
  _id: string;
  name: string;
  sharePrice: number;
  priceChange24h: number;
  income: number;
  marketCap: number;
  totalRevenue: number;
  exchange: string;
}

interface StockExchangeResponse {
  listings: StockListing[];
}

// --- Market Share ---

export interface MarketShareCompany {
  corporationId: string;
  corporationName: string;
  corporationSequentialId: number | null;
  brandColor: string | null;
  revenue: number;
  marketSharePercent: number;
  isNatcorp: boolean;
}

export interface MarketShareResponse {
  found: boolean;
  sectorType: string;
  sectorLabel: string;
  scope: {
    country: "US" | "UK" | "CA" | "DE" | null;
    stateId: string | null;
    stateName: string | null;
  };
  totalMarket: number;
  totalOwnedRevenue: number;
  unownedRevenue: number;
  unownedPercent: number;
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: 15;
  companies: MarketShareCompany[];
}

export async function getMarketShare(params: {
  type: SectorType;
  country?: string;
  state?: string;
  page?: number;
}): Promise<MarketShareResponse> {
  const url = new URL("/api/discord-bot/marketshare", process.env.GAME_API_URL);
  url.searchParams.set("type", params.type);
  if (params.country) url.searchParams.set("country", params.country);
  if (params.state) url.searchParams.set("state", params.state);
  if (params.page != null) url.searchParams.set("page", String(params.page));

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- Autocomplete ---

export interface AutocompleteResult {
  id: string;
  name: string;
}

interface AutocompleteResponse {
  results: AutocompleteResult[];
}

export async function getAutocomplete(params: {
  type: string;
  q: string;
  limit?: number;
}): Promise<AutocompleteResponse> {
  const url = new URL("/api/discord-bot/autocomplete", process.env.GAME_API_URL);
  url.searchParams.set("type", params.type);
  url.searchParams.set("q", params.q);
  if (params.limit != null) url.searchParams.set("limit", String(params.limit));

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

// --- Government ---

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
  const url = new URL("/api/discord-bot/government", process.env.GAME_API_URL);
  if (country) url.searchParams.set("country", country);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}

export async function getStockExchange(exchange = "global"): Promise<StockExchangeResponse> {
  const url = new URL("/api/stock-exchange", process.env.GAME_API_URL);
  url.searchParams.set("exchange", exchange);

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) await throwApiError(response, url.pathname);
  return response.json();
}
