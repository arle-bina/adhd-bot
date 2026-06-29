// Sync Discord tickets into the game backend (MongoDB) via the discord-bot API.
//
// This is a best-effort, additive mirror of the local tickets.json store: every
// helper here swallows errors and returns undefined on failure so the Discord
// ticket UX never breaks when the game API is slow or down.

import { apiPost, apiPatch } from "./api-base.js";

const TICKETS_ENDPOINT = "/api/discord-bot/tickets";

/** Backend ticket category enum. */
export type GameTicketCategory = "bug" | "moderation" | "account" | "gameplay" | "other";

export interface TicketApiMessage {
  discordMessageId?: string;
  authorId?: string;
  authorName?: string;
  content?: string;
  imageUrls?: string[];
  createdAt?: string;
}

export interface CreateTicketPayload {
  category: GameTicketCategory;
  title: string;
  description: string;
  discordChannelId?: string;
  discordUserId?: string;
  discordUsername?: string;
  discordDisplayName?: string;
  imageUrls?: string[];
  message?: TicketApiMessage;
  /**
   * Original ticket number to preserve when backfilling existing tickets.
   * The backend is idempotent on this (or discordChannelId): if a ticket with
   * this number already exists it is returned without creating a duplicate.
   */
  ticketNumber?: number;
  /** Original creation timestamp (ISO) — used when backfilling historical tickets. */
  createdAt?: string;
  /** Ticket status, e.g. "open" / "closed". */
  status?: string;
}

export interface CreateTicketResponse {
  id: string;
  ticketNumber: number;
  reviewAfter?: string;
  message?: string;
}

export type UpdateTicketAction = "append" | "status" | "close" | "retriage";

export interface UpdateTicketPayload {
  ticketNumber?: number;
  discordChannelId?: string;
  action: UpdateTicketAction;
  message?: TicketApiMessage;
  status?: string;
  closedBy?: string;
}

/** True only when the game API is configured — otherwise we skip the sync silently. */
function apiConfigured(): boolean {
  return Boolean(process.env.GAME_API_URL && process.env.GAME_API_KEY);
}

/**
 * Mirror a newly opened ticket into the game backend.
 * Non-fatal: logs and returns undefined on any failure (including missing config).
 */
export async function createTicket(payload: CreateTicketPayload): Promise<CreateTicketResponse | undefined> {
  if (!apiConfigured()) return undefined;
  try {
    return await apiPost<CreateTicketResponse>(TICKETS_ENDPOINT, payload);
  } catch (err) {
    console.error("[ticketsApi] createTicket sync failed:", err);
    return undefined;
  }
}

/**
 * Mirror a follow-up message / status change / close onto an existing ticket.
 * Non-fatal: logs and returns undefined on any failure (including missing config).
 */
export async function updateTicket(payload: UpdateTicketPayload): Promise<CreateTicketResponse | undefined> {
  if (!apiConfigured()) return undefined;
  try {
    return await apiPatch<CreateTicketResponse>(TICKETS_ENDPOINT, payload);
  } catch (err) {
    console.error("[ticketsApi] updateTicket sync failed:", err);
    return undefined;
  }
}
