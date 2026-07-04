// Sync Discord tickets into the game backend (MongoDB) via the discord-bot API.
//
// This is a best-effort, additive mirror of the local tickets.json store: every
// helper here swallows errors and returns undefined on failure so the Discord
// ticket UX never breaks when the game API is slow or down.

import { apiFetch, apiPost, apiPatch } from "./api-base.js";

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

export type UpdateTicketAction = "append" | "status" | "close" | "retriage" | "resolution-delivered";

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

const CREATE_TICKET_RETRIES = 3;
const CREATE_TICKET_RETRY_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mirror a newly opened ticket into the game backend.
 * Retries a few times (transient network/API blips are common); only gives up
 * and returns undefined after all attempts fail. Callers should treat a final
 * undefined as a real sync failure worth surfacing to staff, not a routine no-op.
 */
export async function createTicket(payload: CreateTicketPayload): Promise<CreateTicketResponse | undefined> {
  if (!apiConfigured()) return undefined;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= CREATE_TICKET_RETRIES; attempt++) {
    try {
      return await apiPost<CreateTicketResponse>(TICKETS_ENDPOINT, payload);
    } catch (err) {
      lastErr = err;
      console.error(`[ticketsApi] createTicket sync failed (attempt ${attempt}/${CREATE_TICKET_RETRIES}):`, err);
      if (attempt < CREATE_TICKET_RETRIES) await sleep(CREATE_TICKET_RETRY_DELAY_MS * attempt);
    }
  }
  console.error("[ticketsApi] createTicket sync exhausted retries, giving up:", lastErr);
  return undefined;
}

/** A ticket closed in the ops dashboard with an admin resolution message awaiting delivery. */
export interface PendingResolution {
  ticketNumber: number;
  discordUserId: string;
  discordChannelId?: string;
  message: string;
}

interface PendingResolutionsResponse {
  tickets: PendingResolution[];
}

/**
 * Fetch tickets closed in the ops dashboard whose admin resolution message has
 * not yet been delivered to the opener.
 * Non-fatal: logs and returns [] on any failure (including missing config).
 */
export async function getPendingResolutions(): Promise<PendingResolution[]> {
  if (!apiConfigured()) return [];
  try {
    const res = await apiFetch<PendingResolutionsResponse>(`${TICKETS_ENDPOINT}/pending-resolutions`);
    return res.tickets ?? [];
  } catch (err) {
    console.error("[ticketsApi] getPendingResolutions failed:", err);
    return [];
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
