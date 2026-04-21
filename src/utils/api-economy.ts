// Economy-domain API: corporations, bonds, financials, sectors, stock market.

import { apiFetch, apiFetchPublic } from "./api-base.js";

// ---------------------------------------------------------------------------
// Corporation
// ---------------------------------------------------------------------------

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
  logisticsCosts: number;
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
  countryId: string;
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
  return apiFetch<CorporationListResponse>("/api/discord-bot/corporation", { list: "true" });
}

export async function getCorporation(name: string): Promise<CorporationResponse> {
  return apiFetch<CorporationResponse>("/api/discord-bot/corporation", { name });
}

// ---------------------------------------------------------------------------
// Bonds
// ---------------------------------------------------------------------------

export interface BondEntry {
  id: string;
  bondUrl: string;
  corporationName: string;
  corporationId: number | string;
  brandColor: string | null;
  countryId: string | null;
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
  const p: Record<string, string> = {};
  if (params.corp) p.corp = params.corp;
  if (params.page != null) p.page = String(params.page);
  return apiFetch<BondsResponse>("/api/discord-bot/bonds", p);
}

// ---------------------------------------------------------------------------
// Financials
// ---------------------------------------------------------------------------

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
    countryId: string;
  };
  incomeStatement: {
    totalRevenue: number;
    costs: {
      maintenance: number;
      growth: number;
      marketing: number;
      logistics: number;
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
  return apiFetch<FinancialsResponse>("/api/discord-bot/financials", { name });
}

// ---------------------------------------------------------------------------
// Sectors
// ---------------------------------------------------------------------------

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
  countryId: string | null;
  revenue: number;
  growthRate: number;
  workers: number;
  sectorUrl: string;
}

export interface UnownedSector {
  stateId: string;
  stateName: string;
  countryId: string | null;
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

export async function getSectors(params: {
  type: SectorType;
  unowned?: boolean;
  page?: number;
}): Promise<SectorsResponse> {
  const p: Record<string, string> = { type: params.type };
  if (params.unowned != null) p.unowned = String(params.unowned);
  if (params.page != null) p.page = String(params.page);
  return apiFetch<SectorsResponse>("/api/discord-bot/sectors", p);
}

// ---------------------------------------------------------------------------
// Stock Exchange (public, no auth)
// ---------------------------------------------------------------------------

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

export async function getStockExchange(exchange = "global"): Promise<StockExchangeResponse> {
  return apiFetchPublic<StockExchangeResponse>("/api/stock-exchange", { exchange });
}

// ---------------------------------------------------------------------------
// Market Data
// ---------------------------------------------------------------------------

export interface MarketHistoryPoint {
  turn: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataResponse {
  found: boolean;
  exchange: string;
  exchangeName: string;
  currentTurn: number;
  currentPrice: number;
  priceChange24h: number;
  priceChangePct: number;
  history: MarketHistoryPoint[];
}

export async function getMarketData(params: {
  exchange: string;
  days?: number;
  chartType?: string;
}): Promise<MarketDataResponse> {
  const p: Record<string, string> = { exchange: params.exchange };
  if (params.days != null) p.days = String(params.days);
  if (params.chartType) p.chartType = params.chartType;
  return apiFetch<MarketDataResponse>("/api/discord-bot/market", p);
}

// ---------------------------------------------------------------------------
// Market Share
// ---------------------------------------------------------------------------

export interface MarketShareCompany {
  corporationId: string;
  corporationName: string;
  corporationSequentialId: number | null;
  brandColor: string | null;
  countryId: string | null;
  revenue: number;
  marketSharePercent: number;
  isNatcorp: boolean;
}

export interface MarketShareResponse {
  found: boolean;
  sectorType: string;
  sectorLabel: string;
  scope: {
    country: "US" | "UK" | "CA" | "DE" | "JP" | null;
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
  /** Home currency of the Discord user's linked game account, if found. */
  suggestedCurrencyCode: string | null;
}

export async function getMarketShare(params: {
  type: SectorType;
  country?: string;
  state?: string;
  page?: number;
  discordId?: string;
}): Promise<MarketShareResponse> {
  const p: Record<string, string> = { type: params.type };
  if (params.country) p.country = params.country;
  if (params.state) p.state = params.state;
  if (params.page != null) p.page = String(params.page);
  if (params.discordId) p.discordId = params.discordId;
  return apiFetch<MarketShareResponse>("/api/discord-bot/marketshare", p);
}

// ---------------------------------------------------------------------------
// Stock Chart
// ---------------------------------------------------------------------------

export interface StockChartMarketPoint {
  turn: number;
  marketCap: number;
  bySector: Record<string, number>;
  timestamp: string;
}

export interface StockChartCorpPoint {
  turn: number;
  sharePrice: number;
  marketCap: number;
  revenue: number;
  income: number;
  timestamp: string;
}

export interface StockChartMarketResponse {
  found: true;
  mode: "market";
  exchange: string;
  points: StockChartMarketPoint[];
}

export interface StockChartCorpResponse {
  found: true;
  mode: "corporation";
  corporation: { name: string; sequentialId: number; type: string; countryId: string };
  points: StockChartCorpPoint[];
}

export interface StockChartNotFoundResponse {
  found: false;
}

export type StockChartResponse =
  | StockChartMarketResponse
  | StockChartCorpResponse
  | StockChartNotFoundResponse;

export async function getStockChart(params: {
  corp?: string;
  country?: string;
  limit?: number;
}): Promise<StockChartResponse> {
  const p: Record<string, string> = {};
  if (params.corp) p.corp = params.corp;
  if (params.country) p.country = params.country;
  if (params.limit != null) p.limit = String(params.limit);
  return apiFetch<StockChartResponse>("/api/discord-bot/stock-chart", p);
}

export async function getStockChartCorpList(): Promise<CorporationListItem[]> {
  const data = await apiFetch<{ corporations: CorporationListItem[] }>("/api/discord-bot/corporation", { list: "true" });
  return data.corporations;
}
