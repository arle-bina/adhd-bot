// Barrel re-export — all API functions and types are now split by domain.
// This file exists so existing imports continue to work unchanged.
// Once all imports point to the domain files, delete this barrel.

export { ApiError } from "./api-base.js";

export {
  lookupByName,
  lookupByDiscordId,
  getLeaderboard,
  getParty,
  getElections,
  getState,
  getNews,
  getCareer,
  getAchievements,
  getRace,
  getPrediction,
  getGovernment,
  getSyncRoles,
} from "./api-politics.js";

export type {
  CharacterResult,
  LookupResponse,
  LeaderboardCharacter,
  LeaderboardMetric,
  ElectionCandidate,
  Election,
  CareerEvent,
  Achievement,
  RaceEndorsement,
  RaceCandidate,
  RaceVoteSnapshot,
  RaceVotes,
  RaceElection,
  RacePhase,
  RaceIncumbent,
  RaceDetailResponse,
  RaceResponse,
  PredictionPartyEntry,
  PredictionResponse,
  GovernmentOfficial,
  GovernmentResponse,
  SyncRolesDetails,
  SyncRolesResponse,
} from "./api-politics.js";

export {
  getCorporationList,
  getCorporation,
  getBonds,
  getFinancials,
  getSectors,
  getMarketData,
  getMarketShare,
  getStockChart,
  getStockChartCorpList,
  getStockExchange,
} from "./api-economy.js";

export type {
  CorporationListItem,
  CorporationSector,
  CorporationFinancials,
  CorporationCeo,
  CorporationData,
  CorporationResponse,
  BondEntry,
  BondsResponse,
  FinancialsResponse,
  SectorType,
  OwnedSector,
  UnownedSector,
  OwnedSectorsResponse,
  UnownedSectorsResponse,
  SectorsResponse,
  StockListing,
  MarketHistoryPoint,
  MarketDataResponse,
  MarketShareCompany,
  MarketShareResponse,
  StockChartMarketPoint,
  StockChartCorpPoint,
  StockChartMarketResponse,
  StockChartCorpResponse,
  StockChartNotFoundResponse,
  StockChartResponse,
} from "./api-economy.js";

export {
  getTurnStatus,
  getAutocomplete,
  getBlackjackFund,
  getBlackjackBalance,
  postBlackjackPlaceWager,
  postBlackjackResolve,
  getChannelConfig,
  postWebhookReaction,
  postDiscordSuggestion,
} from "./api-game.js";

export type {
  TurnStatus,
  AutocompleteResult,
  BlackjackFundResponse,
  BlackjackBalanceResponse,
  BlackjackPlaceWagerRequest,
  BlackjackPlaceWagerResponse,
  BlackjackResolveRequest,
  BlackjackResolveResponse,
  ChannelConfigResponse,
  WebhookReactionRequest,
  WebhookReactionResponse,
  SubmitSuggestionRequest,
  SubmitSuggestionResponse,
} from "./api-game.js";

export {
  currencyFor,
  symbolFor,
  formatCurrency,
  formatSharePrice,
  formatCurrencySigned,
  padCurrency,
  fetchForexRates,
  convertCurrency,
  COUNTRY_CURRENCY,
  CURRENCY_SYMBOLS,
  CURRENCY_CHOICES,
  EXCHANGE_CURRENCY,
} from "./currency.js";
