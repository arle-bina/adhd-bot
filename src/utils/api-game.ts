// Game-domain API: turn status, autocomplete, blackjack.

import { apiFetch, apiFetchPublic, apiPost } from "./api-base.js";

// ---------------------------------------------------------------------------
// Turn Status (public, no auth)
// ---------------------------------------------------------------------------

export interface TurnStatus {
  currentTurn: number;
  currentYear: number;
  lastTurnProcessed: string;
  nextScheduledTurn: string;
}

export async function getTurnStatus(): Promise<TurnStatus> {
  return apiFetchPublic<TurnStatus>("/api/game/turn/status");
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

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
  const p: Record<string, string> = { type: params.type, q: params.q };
  if (params.limit != null) p.limit = String(params.limit);
  return apiFetch<AutocompleteResponse>("/api/discord-bot/autocomplete", p);
}

// ---------------------------------------------------------------------------
// Blackjack
// ---------------------------------------------------------------------------

export interface BlackjackFundResponse {
  found: boolean;
  balance: number;
  totalWagered?: number;
  totalPaidOut?: number;
  collected?: number;
  gamesPlayed?: number;
}

export async function getBlackjackFund(): Promise<BlackjackFundResponse> {
  return apiFetch<BlackjackFundResponse>("/api/discord-bot/blackjack/fund");
}

export interface BlackjackBalanceResponse {
  cashOnHand: number;
  characterName: string;
}

export async function getBlackjackBalance(discordId: string): Promise<BlackjackBalanceResponse> {
  return apiFetch<BlackjackBalanceResponse>("/api/discord-bot/blackjack/balance", { discordId });
}

export interface BlackjackPlaceWagerRequest {
  discordId: string;
  wagerAmount: number;
  gameId: string;
}

export interface BlackjackPlaceWagerResponse {
  previousCash: number;
  newCash: number;
}

export async function postBlackjackPlaceWager(
  body: BlackjackPlaceWagerRequest
): Promise<BlackjackPlaceWagerResponse> {
  return apiPost<BlackjackPlaceWagerResponse>("/api/discord-bot/blackjack/place-wager", body);
}

export interface BlackjackResolveRequest {
  discordId: string;
  gameId: string;
  result: "win" | "loss" | "push";
  payoutMultiplier?: number;
}

export interface BlackjackResolveResponse {
  previousCash: number;
  newCash: number;
  payout?: number;
}

export async function postBlackjackResolve(body: BlackjackResolveRequest): Promise<BlackjackResolveResponse> {
  return apiPost<BlackjackResolveResponse>("/api/discord-bot/blackjack/resolve", body);
}
