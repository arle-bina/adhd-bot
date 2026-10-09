import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readJsonSafe, writeJsonAtomic } from "./atomicJson.js";
import type { TicketPlatform } from "./ticketPlatform.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, "..", "..", "data");
const TICKET_FILE = join(DATA_DIR, "tickets.json");

export type TicketCategory = "bug" | "suggestion" | "moderation" | "mechanics";

export interface Ticket {
  userId: string;
  category: TicketCategory;
  channelId: string;
  createdAt: string;
  ticketNumber: number;
  subject?: string;
  description?: string;
  /** Surface the reporter was playing on (bug reports only). */
  platform?: TicketPlatform;
  /** User IDs of openers whose tickets were merged into this one */
  mergedFromUserIds?: string[];
  /** Staff member who claimed this ticket */
  claimedByUserId?: string;
  claimedAt?: string;
  /** Message ID of the initial ticket embed (used to update it on claim) */
  embedMessageId?: string;
  /** Persistent player-facing intake card, edited in place after each response. */
  intakeCardMessageId?: string;
  /** Schema version of the currently adopted persistent intake controls. */
  intakeCardVersion?: number;
  /** The backend acknowledged the current intake seed for this ticket. */
  intakeSeeded?: boolean;
  intakeCandidatePageUrl?: string;
  intakePageDescription?: string;
  intakeAwaitingReply?: "page" | "details" | null;
  intakeRevision?: number;
  intakeReceiptUrl?: string;
  /** The receipt link was missing at creation; recovery posts it once when found. */
  intakeReceiptPending?: boolean;
  intakePageConfirmed?: boolean;
  intakePlatformConfirmed?: boolean;
  intakePlatformLabel?: string;
  intakeGameVersion?: string;
  intakeClientVersion?: string;
  /** Interaction IDs make local replay/recovery idempotent across restarts. */
  intakeInteractionIds?: string[];
  /** Pending intake mutations are replayed until the API acknowledges them. */
  pendingIntakeInteractions?: Array<{
    interactionId: string;
    reporterDiscordId: string;
    action: "confirm_page" | "decline_page" | "change_page" | "confirm_platform" | "edit_details";
    value?: string;
    gameVersion?: string | null;
    clientVersion?: string | null;
  }>;
  /** Ticket number assigned by the game backend (MongoDB sync), if mirrored */
  apiTicketNumber?: number;
  /** Durable close intent. Retained until the backend confirms close. */
  pendingClose?: {
    closerId: string;
    closerTag: string;
    resolution: string;
    createdAt: string;
    channelReceiptMessageId?: string;
    dmMessageId?: string;
    transcriptMessageId?: string;
  };
  pendingMerge?: {
    targetChannelId: string;
    targetTicketNumber: number;
    targetApiTicketNumber?: number;
    targetUserId: string;
    targetCategory: TicketCategory;
    staffTag: string;
    staffId: string;
    reason: string;
    createdAt: string;
  };
  /** A Discord channel was deleted outside the bot; keep the conversation state explicit. */
  missingConversation?: { detectedAt: string; eventId: string };
}

interface TicketData {
  tickets: Record<string, Record<string, Ticket>>;
  panels: Record<string, Record<string, string>>;
  categoryIds: Record<string, string>;
  counters: Record<string, number>;
}

function loadData(): TicketData {
  // onCorrupt: "throw" — the counters map is the source of truth for ticket
  // numbering, so a corrupt file must never silently reset it to {} (that would
  // re-hand-out #1 and double-allocate the historical range). readJsonSafe
  // recovers from the `.bak` snapshot if present, otherwise fails loudly.
  return readJsonSafe<TicketData>(TICKET_FILE, {
    fallback: { tickets: {}, panels: {}, categoryIds: {}, counters: {} },
    onCorrupt: "throw",
  });
}

function saveData(data: TicketData): void {
  writeJsonAtomic(TICKET_FILE, data);
}

export function getTickets(guildId: string): Record<string, Ticket> {
  const data = loadData();
  return data.tickets[guildId] ?? {};
}

export function addTicket(guildId: string, ticket: Ticket): void {
  const data = loadData();
  if (!data.tickets[guildId]) data.tickets[guildId] = {};
  data.tickets[guildId][ticket.channelId] = ticket;
  saveData(data);
}

export function claimTicket(guildId: string, channelId: string, claimerUserId: string): void {
  const data = loadData();
  const ticket = data.tickets[guildId]?.[channelId];
  if (!ticket) return;
  ticket.claimedByUserId = claimerUserId;
  ticket.claimedAt = new Date().toISOString();
  saveData(data);
}

export function removeTicket(guildId: string, channelId: string): void {
  const data = loadData();
  if (data.tickets[guildId]) {
    delete data.tickets[guildId][channelId];
    saveData(data);
  }
}

export function getTicketByChannel(guildId: string, channelId: string): Ticket | undefined {
  const data = loadData();
  return data.tickets[guildId]?.[channelId];
}

export function getTicketByNumber(guildId: string, ticketNumber: number): Ticket | undefined {
  const tickets = getTickets(guildId);
  return Object.values(tickets).find((t) => t.ticketNumber === ticketNumber);
}

export function getTicketNumberFloor(guildId: string): number {
  const data = loadData();
  return Object.values(data.tickets[guildId] ?? {}).reduce(
    (floor, ticket) => Math.max(floor, ticket.ticketNumber),
    data.counters[guildId] ?? 0,
  );
}

/** Remember a number reserved by the shared game counter or imported from Discord. */
export function setTicketNumberFloor(guildId: string, floor: number): void {
  const data = loadData();
  data.counters[guildId] = Math.max(data.counters[guildId] ?? 0, floor);
  saveData(data);
}

export const MAX_TICKETS_PER_CATEGORY = 3;

export function findOpenTicket(guildId: string, userId: string, category: TicketCategory): Ticket | undefined {
  const tickets = getTickets(guildId);
  return Object.values(tickets).find((t) => t.userId === userId && t.category === category);
}

export function findOpenTickets(guildId: string): Ticket[] {
  const tickets = getTickets(guildId);
  return Object.values(tickets);
}

export function findOpenTicketsByUser(guildId: string, userId: string): Ticket[] {
  const tickets = getTickets(guildId);
  return Object.values(tickets).filter((t) => t.userId === userId);
}

export function countOpenTicketsByUserCategory(guildId: string, userId: string, category: TicketCategory): number {
  const tickets = getTickets(guildId);
  return Object.values(tickets).filter((t) => t.userId === userId && t.category === category).length;
}

export function addPanel(guildId: string, messageId: string, panelChannelId: string): void {
  const data = loadData();
  if (!data.panels[guildId]) data.panels[guildId] = {};
  data.panels[guildId][messageId] = panelChannelId;
  saveData(data);
}

export function isPanel(guildId: string, messageId: string): boolean {
  const data = loadData();
  return !!data.panels[guildId]?.[messageId];
}

export function getCategoryId(guildId: string): string | undefined {
  const data = loadData();
  return data.categoryIds[guildId];
}

export function setCategoryId(guildId: string, categoryId: string): void {
  const data = loadData();
  data.categoryIds[guildId] = categoryId;
  saveData(data);
}
