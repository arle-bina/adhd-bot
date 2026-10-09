// Shared presentation for the casino commands: money formatting, error text,
// and the stake option every game uses.

import type {
  ChatInputCommandInteraction,
  SlashCommandIntegerOption,
  ButtonInteraction,
} from "discord.js";
import { ApiError } from "./api-base.js";
import { CURRENCY_SYMBOLS } from "./currency.js";
import { EMBED_COLORS, baseEmbed } from "./embeds.js";
import { replyWithError } from "./helpers.js";
import type { CasinoLimits } from "./api-casino.js";

export const CASINO_COLORS = {
  table: 0x0d3b2c,
  win: EMBED_COLORS.success,
  loss: EMBED_COLORS.error,
  push: EMBED_COLORS.warning,
} as const;

/** Largest stake the slash option accepts. The server enforces the real table limit. */
export const MAX_STAKE_OPTION = 1_000_000_000_000;

/** Format a whole amount in a currency. Codes without a known symbol print as "1,000 FRF". */
export function money(amount: number, currency: string): string {
  const n = Math.floor(amount).toLocaleString("en-US");
  const sym = CURRENCY_SYMBOLS[currency];
  return sym ? `${sym}${n}` : `${n} ${currency}`;
}

export function signedMoney(amount: number, currency: string): string {
  if (amount === 0) return money(0, currency);
  return amount > 0 ? `+${money(amount, currency)}` : `-${money(Math.abs(amount), currency)}`;
}

export function multiplierLabel(m: number): string {
  return `${m.toLocaleString("en-US", { maximumFractionDigits: 2 })}x`;
}

/** Stake option shared by every staked game. */
export function stakeOption(opt: SlashCommandIntegerOption, description = "Stake, in your home currency"): SlashCommandIntegerOption {
  return opt.setName("stake").setDescription(description).setRequired(true).setMinValue(1).setMaxValue(MAX_STAKE_OPTION);
}

/** Statuses where the game server explains the problem in words a player can act on. */
const PLAYER_FACING_STATUSES = new Set([400, 402, 403, 404, 409, 503]);

interface CasinoErrorBody {
  error?: unknown;
  message?: unknown;
  currency?: unknown;
  maxStake?: unknown;
  maxPayout?: unknown;
  minBuyIn?: unknown;
  maxBuyIn?: unknown;
}

/** The server's own explanation for a refused casino request, or null for anything unexpected. */
export function casinoRefusal(error: unknown): string | null {
  if (!(error instanceof ApiError) || !PLAYER_FACING_STATUSES.has(error.status)) return null;
  let body: CasinoErrorBody = {};
  try {
    body = JSON.parse(error.responseBody) as CasinoErrorBody;
  } catch {
    return null;
  }
  const text = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : null;
  if (!text) return null;
  if (/no user found|no character/i.test(text)) {
    return "Link your Discord account to a character on ahousedividedgame.com first.";
  }
  const currency = typeof body.currency === "string" ? body.currency : null;
  const extra: string[] = [];
  if (currency && typeof body.maxStake === "number") extra.push(`Table limit: ${money(body.maxStake, currency)} per stake.`);
  if (currency && typeof body.minBuyIn === "number" && typeof body.maxBuyIn === "number") {
    extra.push(`Buy-ins run from ${money(body.minBuyIn, currency)} to ${money(body.maxBuyIn, currency)}.`);
  }
  return [text.endsWith(".") ? text : `${text}.`, ...extra].join("\n");
}

/** Reply to a deferred command with the server's refusal, or the standard error embed. */
export async function replyCasinoError(
  interaction: ChatInputCommandInteraction,
  command: string,
  error: unknown,
): Promise<void> {
  const refusal = casinoRefusal(error);
  if (!refusal) {
    await replyWithError(interaction, command, error);
    return;
  }
  const embed = baseEmbed({ title: `/${command}`, description: refusal, color: EMBED_COLORS.warning });
  await interaction.editReply({ embeds: [embed], content: "", components: [] });
}

/** Ephemeral follow-up for a refused button press. */
export async function followUpCasinoError(btn: ButtonInteraction, error: unknown): Promise<void> {
  const text = casinoRefusal(error) ?? "That did not go through. Try again shortly.";
  const payload = { content: text, ephemeral: true };
  if (btn.deferred || btn.replied) await btn.followUp(payload);
  else await btn.reply(payload);
}

export function limitsLine(limits: CasinoLimits): string {
  return `Table limit ${money(limits.maxStake, limits.currency)} · max win ${money(limits.maxPayout, limits.currency)}`;
}

/** Result line shared by the instant games. */
export function settlementLines(r: { currency: string; stake: number; payout: number; net: number; capped: boolean }): string {
  const lines = [`**Stake:** ${money(r.stake, r.currency)}`, `**Paid:** ${money(r.payout, r.currency)}`, `**Net:** ${signedMoney(r.net, r.currency)}`];
  if (r.capped) lines.push("_This win hit the table's maximum payout._");
  return lines.join("\n");
}

export function outcomeColor(net: number): number {
  if (net > 0) return CASINO_COLORS.win;
  if (net < 0) return CASINO_COLORS.loss;
  return CASINO_COLORS.push;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
