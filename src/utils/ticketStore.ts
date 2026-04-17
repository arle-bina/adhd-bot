import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, "..", "..", "data");
const TICKET_FILE = join(DATA_DIR, "tickets.json");

export type TicketCategory = "bug" | "suggestion" | "moderation";

export interface Ticket {
  userId: string;
  category: TicketCategory;
  channelId: string;
  createdAt: string;
  ticketNumber: number;
  subject?: string;
  description?: string;
}

interface TicketData {
  tickets: Record<string, Record<string, Ticket>>;
  panels: Record<string, Record<string, string>>;
  categoryIds: Record<string, string>;
  counters: Record<string, number>;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadData(): TicketData {
  ensureDataDir();
  if (!existsSync(TICKET_FILE)) {
    return { tickets: {}, panels: {}, categoryIds: {}, counters: {} };
  }
  try {
    const raw = readFileSync(TICKET_FILE, "utf-8");
    return JSON.parse(raw) as TicketData;
  } catch {
    return { tickets: {}, panels: {}, categoryIds: {}, counters: {} };
  }
}

function saveData(data: TicketData): void {
  ensureDataDir();
  writeFileSync(TICKET_FILE, JSON.stringify(data, null, 2), "utf-8");
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

export function getNextTicketNumber(guildId: string): number {
  const data = loadData();
  const next = (data.counters[guildId] ?? 0) + 1;
  data.counters[guildId] = next;
  saveData(data);
  return next;
}

export const MAX_TICKETS_PER_CATEGORY = 3;

export function findOpenTicket(guildId: string, userId: string, category: TicketCategory): Ticket | undefined {
  const tickets = getTickets(guildId);
  const guildChannels = new Set<string>(); // caller should check channel existence separately
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