// Casino game API. The game server holds every stake and draws every house
// result; these calls only ask it to. Amounts are in the player's home currency
// unless the field name ends in Anchor.

import { apiFetch, apiPost } from "./api-base.js";

const BASE = "/api/discord-bot/casino";

export interface CasinoLimits {
  currency: string;
  maxStake: number;
  maxPayout: number;
}

// ---------------------------------------------------------------------------
// House
// ---------------------------------------------------------------------------

export interface CasinoGameStats {
  played: number;
  handleAnchor: number;
  paidOutAnchor: number;
}

export interface CasinoHouseResponse {
  anchorBalance: number;
  maxStakeAnchor: number;
  maxPayoutAnchor: number;
  games: Record<string, CasinoGameStats>;
  player?: CasinoLimits & {
    characterName: string;
    rate: number;
    highlow: HighLowSession | null;
  };
}

export function getCasinoHouse(discordId?: string): Promise<CasinoHouseResponse> {
  return apiFetch<CasinoHouseResponse>(`${BASE}/house`, discordId ? { discordId } : undefined);
}

// ---------------------------------------------------------------------------
// Instant house games
// ---------------------------------------------------------------------------

export type SlotSymbol =
  | "CHERRY"
  | "LEMON"
  | "ORANGE"
  | "GRAPE"
  | "BELL"
  | "STAR"
  | "SEVEN"
  | "DIAMOND"
  | "WILD";

export interface SlotsOutcome {
  reels: [SlotSymbol, SlotSymbol, SlotSymbol];
  kind: "special" | "triple" | "double" | "none";
  name: string | null;
  jackpot: boolean;
}

export type RouletteBet =
  | "red"
  | "black"
  | "odd"
  | "even"
  | "low"
  | "high"
  | "dozen1"
  | "dozen2"
  | "dozen3"
  | "column1"
  | "column2"
  | "column3"
  | "straight";

export interface RouletteOutcome {
  pocket: number;
  color: "red" | "black" | "green";
  won: boolean;
  bet: RouletteBet;
  number?: number;
}

export interface CrashOutcome {
  crashPoint: number;
  target: number;
  won: boolean;
}

export interface CrapsOutcome {
  rolls: [number, number][];
  point: number | null;
  result: "win" | "loss" | "push";
  bet: "pass" | "dontpass";
}

export type InstantPlayRequest =
  | { game: "slots"; discordId: string; stake: number }
  | { game: "roulette"; discordId: string; stake: number; bet: RouletteBet; number?: number }
  | { game: "crash"; discordId: string; stake: number; target: number }
  | { game: "craps"; discordId: string; stake: number; bet: "pass" | "dontpass" };

interface InstantPlayBase {
  playId: string;
  characterName: string;
  currency: string;
  stake: number;
  multiplier: number;
  payout: number;
  net: number;
  capped: boolean;
  limits: CasinoLimits;
}

export type InstantPlayResponse<O> = InstantPlayBase & { outcome: O };

export function playSlots(discordId: string, stake: number): Promise<InstantPlayResponse<SlotsOutcome>> {
  return apiPost(`${BASE}/play`, { game: "slots", discordId, stake } satisfies InstantPlayRequest);
}

export function playRoulette(
  discordId: string,
  stake: number,
  bet: RouletteBet,
  number?: number,
): Promise<InstantPlayResponse<RouletteOutcome>> {
  return apiPost(`${BASE}/play`, { game: "roulette", discordId, stake, bet, number } satisfies InstantPlayRequest);
}

export function playCrash(discordId: string, stake: number, target: number): Promise<InstantPlayResponse<CrashOutcome>> {
  return apiPost(`${BASE}/play`, { game: "crash", discordId, stake, target } satisfies InstantPlayRequest);
}

export function playCraps(
  discordId: string,
  stake: number,
  bet: "pass" | "dontpass",
): Promise<InstantPlayResponse<CrapsOutcome>> {
  return apiPost(`${BASE}/play`, { game: "craps", discordId, stake, bet } satisfies InstantPlayRequest);
}

// ---------------------------------------------------------------------------
// High-low
// ---------------------------------------------------------------------------

export interface HighLowSession {
  sessionId: string;
  status: "active" | "lost" | "cashed";
  stake: number;
  currency: string;
  card: number;
  multiplier: number;
  steps: number;
  maxSteps: number;
  history: { card: number; guess: "higher" | "lower"; next: number; correct: boolean }[];
  payout?: number;
  capped?: boolean;
  potential: number;
  higherMultiplier: number;
  lowerMultiplier: number;
  expiresAt: string;
}

export function startHighLow(discordId: string, stake: number): Promise<{ session: HighLowSession }> {
  return apiPost(`${BASE}/highlow`, { action: "start", discordId, stake });
}

export function actHighLow(
  discordId: string,
  sessionId: string,
  action: "higher" | "lower" | "cashout",
): Promise<{ session: HighLowSession }> {
  return apiPost(`${BASE}/highlow`, { action, discordId, sessionId });
}

// ---------------------------------------------------------------------------
// Shared-pot rounds: race, lottery, poker
// ---------------------------------------------------------------------------

export type RoundGame = "race" | "lottery" | "poker";
export type RoundStatus = "open" | "running" | "settling" | "settled" | "cancelled";
export type RacerId = "turtle" | "snake" | "rabbit" | "dragon";

export interface CasinoRound {
  roundId: string;
  game: RoundGame;
  status: RoundStatus;
  hostDiscordId: string | null;
  channelId: string | null;
  tier?: "low" | "high";
  ticketAnchor?: number;
  buyInAnchor?: number;
  startingChips?: number;
  maxPlayers?: number;
  potAnchor: number;
  closesAt: string;
  expiresAt: string;
  entries: {
    discordId: string;
    characterName: string;
    currency: string;
    stake: number;
    anchorAmount: number;
    selection?: RacerId;
    tickets?: number;
  }[];
  outcome?: {
    winner?: RacerId;
    frames?: number[][];
    winnerDiscordId?: string;
    chips?: Record<string, number>;
    refunded?: boolean;
    reason?: string;
  };
  payouts?: { discordId: string; characterName: string; currency: string; amount: number; kind: "win" | "refund" }[];
  rakeAnchor?: number;
  settledAt?: string;
}

export function listCasinoRounds(params: {
  game?: RoundGame;
  status?: RoundStatus;
  due?: boolean;
  channelId?: string;
}): Promise<{ rounds: CasinoRound[] }> {
  const query: Record<string, string> = {};
  if (params.game) query.game = params.game;
  if (params.status) query.status = params.status;
  if (params.due) query.due = "1";
  if (params.channelId) query.channelId = params.channelId;
  return apiFetch(`${BASE}/rounds`, query);
}

export function getCasinoRound(roundId: string): Promise<{ round: CasinoRound }> {
  return apiFetch(`${BASE}/rounds/${encodeURIComponent(roundId)}`);
}

export type CreateRoundRequest =
  | { game: "race"; discordId: string; channelId: string | null; bettingSeconds?: number }
  | { game: "lottery"; discordId: string; tier: "low" | "high"; channelId: string | null; hours?: number }
  | { game: "poker"; discordId: string; channelId: string | null; buyIn: number; maxPlayers?: number };

export function createCasinoRound(body: CreateRoundRequest): Promise<{ round: CasinoRound; created: boolean }> {
  return apiPost(`${BASE}/rounds`, body);
}

export type RoundActionRequest =
  | { action: "enter"; discordId: string; stake?: number; selection?: RacerId; tickets?: number }
  | { action: "start"; discordId: string }
  | { action: "settle"; discordId: string; chips?: Record<string, number> }
  | { action: "cancel"; discordId: string; reason?: string };

export function casinoRoundAction(
  roundId: string,
  body: RoundActionRequest,
): Promise<{ round: CasinoRound; stake?: number; currency?: string }> {
  return apiPost(`${BASE}/rounds/${encodeURIComponent(roundId)}`, body);
}
