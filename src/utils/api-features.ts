// Public v1 API wrappers for the feature commands (/country, /commodity,
// /wars, /legislation) and the live /turn status. Shapes mirror the game's
// src/lib/publicApi/* query modules; nullable fields are explicit.

import { apiFetch, apiFetchPublic } from "./api-base.js";

const V1 = "/api/public/v1";

// ---------------------------------------------------------------------------
// Country
// ---------------------------------------------------------------------------

export interface PartySeatRow {
  partyId: string;
  partyName: string;
  partyColor: string;
  seats: number;
  seatPct?: number;
}

export interface CountrySummary {
  found: boolean;
  countryId: string;
  name: string;
  governmentType: string | null;
  population: number | null;
  currentLeader: { name: string | null; party: string | null; profileUrl: string | null } | null;
  legislatureComposition: PartySeatRow[];
  lastElectionCycle: number | null;
}

export interface RatePoint {
  turn: number;
  rate: number;
}

export interface CountryEconomy {
  found: boolean;
  countryId: string;
  primeRate: number | null;
  inflation: number | null;
  gdpGrowth: number | null;
  currencyCode: string | null;
  population: number | null;
  gdp: number | null;
  gdpPerCapita: number | null;
  debt: { principal: number | null; debtToGdpRatio: number | null; creditRating: string | null } | null;
  budgetBalance: number | null;
  budgetBalancePctGdp: number | null;
  investorConfidence: number | null;
  chair: { name: string; profileUrl: string | null } | null;
  rateHistory: RatePoint[];
  inflationHistory: RatePoint[];
  gdpGrowthHistory: RatePoint[];
  stockMarket: { totalMarketCap: number; change1h: number; change24h: number; exchange: string | null };
}

export interface HistoryPoint {
  turn: number;
  value: number;
}

export interface FiscalYearPoint {
  fiscalYear: number;
  turn: number;
  recordedAt: string;
  currencyCode: string | null;
  gdp: number;
  revenue: number;
  spending: number;
  surplus: number;
  debtPrincipal: number;
  debtToGdpRatio: number;
  creditRating: string;
  inflation: number;
}

export interface CountryEconomyHistory {
  found: boolean;
  countryId: string;
  countryName: string;
  series: { primeRate: HistoryPoint[]; inflation: HistoryPoint[]; gdpGrowth: HistoryPoint[] };
  fiscalYears: FiscalYearPoint[];
}

export interface CountryBudget {
  found: boolean;
  countryId: string;
  countryName?: string;
  fiscalYear?: number;
  currencyCode?: string;
  gdp?: number | null;
  revenue?: { total: number | null; bySource: Record<string, number> };
  spending?: {
    total: number | null;
    byCategory: Record<string, number>;
    stateGrants: number | null;
    debtInterest: number | null;
  };
  balance?: number;
  balancePctGdp?: number | null;
  treasuryBalance?: number | null;
  debt?: {
    principal: number | null;
    interestRate: number | null;
    ceiling: number | null;
    debtToGdpRatio: number | null;
    creditRating: string | null;
    crisisState: string;
  };
  economicIndicators?: {
    inflation: number | null;
    gdpGrowth: number | null;
    wageGrowth: number | null;
    tradeGrowth: number | null;
    investorConfidence: number | null;
  };
}

export interface PendingBill {
  id: string;
  title: string;
  status: string;
  sponsor: string | null;
  scheduledVoteAt: string | null;
}

export interface PassedBill {
  id: string;
  title: string;
  passedAt: string | null;
  vote: { yes: number; no: number };
}

export interface CountryLegislature {
  found: boolean;
  countryId: string;
  chamber: string;
  totalSeats: number;
  composition: Array<Omit<PartySeatRow, "seatPct">>;
  pendingBills: PendingBill[];
  recentlyPassed: PassedBill[];
}

interface MetricSummary {
  average: number;
  populationWeightedAverage: number;
  trend: number;
}

export interface CountryMetrics {
  found: boolean;
  countryId: string;
  governmentApproval?: number;
  categories?: Record<string, Record<string, MetricSummary>>;
}

const code = (c: string): string => encodeURIComponent(c.toUpperCase());

export const getCountrySummary = (c: string) => apiFetch<CountrySummary>(`${V1}/country/${code(c)}`);
export const getCountryEconomy = (c: string) => apiFetch<CountryEconomy>(`${V1}/country/${code(c)}/economy`);
export const getCountryEconomyHistory = (c: string, limit = 60) =>
  apiFetch<CountryEconomyHistory>(`${V1}/country/${code(c)}/economy/history`, { limit: String(limit) });
export const getCountryBudget = (c: string) => apiFetch<CountryBudget>(`${V1}/country/${code(c)}/budget`);
export const getCountryLegislature = (c: string) =>
  apiFetch<CountryLegislature>(`${V1}/country/${code(c)}/legislature`);
export const getCountryMetrics = (c: string, category = "economic") =>
  apiFetch<CountryMetrics>(`${V1}/country/${code(c)}/metrics`, { category });

// ---------------------------------------------------------------------------
// Commodities
// ---------------------------------------------------------------------------

export interface CommodityRow {
  key: string;
  label: string;
  unit: string;
  basePrice: number;
  globalPrice: number;
  globalSupply: number;
  globalDemand: number;
  nationalPrice?: number | null;
  nationalSupply?: number | null;
  nationalDemand?: number | null;
  priceAttribution: unknown;
  turn: number;
}

export interface CommodityDetail extends CommodityRow {
  statePrices: Record<string, number>;
  stateSupply: Record<string, number>;
  stateDemand: Record<string, number>;
  topProducers: Array<{ stateId: string; supply: number }>;
  topConsumers: Array<{ stateId: string; demand: number }>;
}

export const getCommodities = (country?: string) =>
  apiFetch<{ commodities: CommodityRow[] }>(`${V1}/commodities`, country ? { country: country.toUpperCase() } : undefined);

export const getCommodityDetail = (key: string, country?: string) =>
  apiFetch<{ found: boolean; commodity: CommodityDetail }>(
    `${V1}/commodity/${encodeURIComponent(key)}`,
    country ? { country: country.toUpperCase() } : undefined,
  );

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

export interface ConflictSide {
  label: string;
  countries: string[];
  kind: string;
  backer: string | null;
}

export interface Conflict {
  conflictId: number;
  name: string;
  hostCountry: string;
  region: string;
  type: string;
  status: string;
  bloc: string;
  terrain: string;
  severity: number;
  intensity: number;
  control: number;
  controlStart: number | null;
  supplyA: number;
  supplyB: number;
  sideA: ConflictSide;
  sideB: ConflictSide;
}

export const getConflicts = (params: { country?: string; status?: string; limit?: number } = {}) => {
  const q: Record<string, string> = {};
  if (params.country) q.country = params.country.toUpperCase();
  if (params.status) q.status = params.status;
  if (params.limit) q.limit = String(params.limit);
  return apiFetch<{ found: boolean; conflicts: Conflict[] }>(`${V1}/conflicts`, q);
};

// ---------------------------------------------------------------------------
// Legislation and referendums
// ---------------------------------------------------------------------------

export type BillBucket = "pending" | "passed" | "failed";

export interface Bill {
  id: string;
  title: string;
  sponsor: string | null;
  sponsorParty: string | null;
  country: string | null;
  status: string;
  introducedAt: string | null;
  votedAt: string | null;
  vote: { yes: number; no: number; abstain: number };
  effects: Array<{ metric: string; direction: string }>;
}

export interface Referendum {
  id: string | null;
  countryId: string;
  region: { id: string; name: string };
  kind: string;
  targetCountryId: string | null;
  status: string;
  timing: { requestedTurn: number | null; campaignCloseTurn: number | null };
  campaign: { yesShare: number | null };
  result: { yesShare: number; noShare: number; turnout: number; passed: boolean; resolvedTurn: number } | null;
}

export const getBills = (params: { country?: string; status?: BillBucket; limit?: number }) => {
  const q: Record<string, string> = {};
  if (params.country) q.country = params.country.toUpperCase();
  if (params.status) q.status = params.status;
  if (params.limit) q.limit = String(params.limit);
  return apiFetch<{ found: boolean; bills: Bill[] }>(`${V1}/legislation`, q);
};

export const getReferendums = (params: { country?: string; limit?: number }) => {
  const q: Record<string, string> = {};
  if (params.country) q.country = params.country.toUpperCase();
  if (params.limit) q.limit = String(params.limit);
  return apiFetch<{ found: boolean; referendums: Referendum[] }>(`${V1}/referendums`, q);
};

// ---------------------------------------------------------------------------
// Live turn status
// ---------------------------------------------------------------------------

export interface LiveTurnStatus {
  currentTurn: number;
  currentYear: number;
  isActive: boolean;
  isProcessing: boolean;
  lastTurnProcessed: string;
  nextScheduledTurn: string | null;
  pausedAt: string | null;
  pauseReason: string | null;
  pauseKind: string | null;
  processingPhase: string | null;
  processingPhaseLabel: string | null;
  processingProgress: number | null;
  processingTargetTurn: number | null;
  processingStartedAt: string | null;
  fastMode: boolean;
}

export const getLiveTurnStatus = () => apiFetchPublic<LiveTurnStatus>("/api/game/turn/status");
