// /summon: brings the Prime Minister (a read-only agent on the ops box) into a
// channel, where he answers the developers' questions and heals player data
// when they confirm it, until dismissed.
//
// This side only reports message ids. The ops box re-reads every message from
// Discord itself and decides from Discord's data who may instruct the agent:
// /summon commands count only on Keir's own replies (invoker taken from the
// interaction metadata), chat only from developers. Nobody else's messages are
// reported at all. So nothing here is trusted and no shared secret is needed.

import { EmbedBuilder, type Message } from "discord.js";

const SUMMON_TIMEOUT_MS = 60_000;
const DEFAULT_OPS_URL = "https://ops.lakesidegames.net";
const REFRESH_MS = 5 * 60 * 1000;

export const SUMMON_RED = 0xe4003b;
const DISMISS_GREY = 0x6b7280;

// The ops box reads the action from this footer, so the wording is a contract.
export const FOOTER_PREFIX = "Despatch box · ";

export type SummonAction = "start" | "stop";

export interface PokeResult {
  ok: boolean;
  status: number;
  active?: boolean;
  forwarded?: boolean;
  error?: string;
}

export interface SummonStatus {
  active: boolean;
  working?: boolean;
  startedAt?: string;
  summonedBy?: string;
  healPending?: boolean;
  queued?: number;
  checkIns?: number;
  model?: string;
}

export function summonApiBase(): string {
  if (process.env.SUMMON_API_URL) return process.env.SUMMON_API_URL.replace(/\/+$/, "");
  return new URL("/api/summon", process.env.OPS_DASHBOARD_URL || DEFAULT_OPS_URL).toString();
}

/** Channels with a live session. The ops box is the source of truth; this is a cache. */
const activeChannels = new Set<string>();

export function markSummonChannel(channelId: string, active: boolean): void {
  if (active) activeChannels.add(channelId);
  else activeChannels.delete(channelId);
}

export function isSummonChannel(channelId: string): boolean {
  return activeChannels.has(channelId);
}

export async function pokeSummon(channelId: string, messageId: string): Promise<PokeResult> {
  try {
    const response = await fetch(`${summonApiBase()}/poke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, messageId }),
      signal: AbortSignal.timeout(SUMMON_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as Omit<PokeResult, "status">;
    return { ...body, ok: response.ok && body.ok !== false, status: response.status };
  } catch (err) {
    console.error("[summon] poke failed:", err);
    return { ok: false, status: 0, error: "the ops box did not answer" };
  }
}

export async function fetchSummonStatus(channelId: string): Promise<SummonStatus | null> {
  try {
    const response = await fetch(`${summonApiBase()}/status/${channelId}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as SummonStatus;
  } catch {
    return null;
  }
}

export async function refreshSummonChannels(): Promise<void> {
  try {
    const response = await fetch(`${summonApiBase()}/channels`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return;
    const { channels } = (await response.json()) as { channels?: string[] };
    if (!Array.isArray(channels)) return;
    activeChannels.clear();
    for (const id of channels) activeChannels.add(id);
  } catch {
    // Keep the last known set; the next refresh will catch up.
  }
}

export function startSummonRefresh(): void {
  void refreshSummonChannels();
  setInterval(() => void refreshSummonChannels(), REFRESH_MS);
}

export interface PokeDecisionInput {
  channelActive: boolean;
  authorIsBot: boolean;
  isWebhook: boolean;
  isDeveloper: boolean;
}

/** Only developers' messages in a summoned channel are reported. */
export function shouldPoke(input: PokeDecisionInput): boolean {
  if (!input.channelActive || input.authorIsBot || input.isWebhook) return false;
  return input.isDeveloper;
}

export async function handleSummonMessage(message: Message): Promise<void> {
  if (!message.guild || !activeChannels.has(message.channelId)) return;
  const devRoleId = process.env.DEVELOPER_ROLE_ID;
  const poke = shouldPoke({
    channelActive: true,
    authorIsBot: message.author.bot,
    isWebhook: Boolean(message.webhookId),
    isDeveloper: Boolean(devRoleId && message.member?.roles.cache.has(devRoleId)),
  });
  if (!poke) return;
  const result = await pokeSummon(message.channelId, message.id);
  if (result.active === false) activeChannels.delete(message.channelId);
}

const TITLES: Record<SummonAction, string> = {
  start: "Order, order. The Prime Minister has been summoned.",
  stop: "The Prime Minister has left the despatch box.",
};

/**
 * Keir's public reply to a /summon subcommand. For `start` the description is
 * the task itself, verbatim, because that is what the ops box hands the agent.
 */
export function buildSummonEmbed(action: SummonAction, opts: { userId: string; task?: string }): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(TITLES[action])
    .setColor(action === "stop" ? DISMISS_GREY : SUMMON_RED)
    .setFooter({ text: `${FOOTER_PREFIX}${action}` })
    .setTimestamp();

  if (action === "start") {
    embed.setDescription((opts.task ?? "").slice(0, 4000));
    embed.addFields({ name: "Summoned by", value: `<@${opts.userId}>`, inline: true });
  } else {
    embed.setDescription(`Dismissed by <@${opts.userId}>. Anything he left running stops here.`);
  }
  return embed;
}

/** Replaces a command reply when the ops box refused it; the footer marker is dropped. */
export function buildSummonFailureEmbed(reason: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("The Prime Minister could not attend.")
    .setColor(DISMISS_GREY)
    .setDescription(reason.slice(0, 1000))
    .setFooter({ text: "ahousedividedgame.com" })
    .setTimestamp();
}
