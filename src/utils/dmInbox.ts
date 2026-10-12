// Direct messages to the bot go to the ops box inbox, where staff can read
// every conversation and Keir handles reward claims.
//
// Same trust model as /summon: this side only reports a DM channel id and a
// message id. The ops box re-reads the message from Discord itself and checks
// the channel really is a DM with the bot, so nothing sent here is trusted
// and no shared secret is needed.

import type { Message } from "discord.js";

const DEFAULT_OPS_URL = "https://ops.lakesidegames.net";
const POKE_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [2_000, 10_000, 60_000];

export function dmInboxApiBase(): string {
  if (process.env.DM_INBOX_API_URL) return process.env.DM_INBOX_API_URL.replace(/\/+$/, "");
  return new URL("/api/keir/inbox", process.env.OPS_DASHBOARD_URL || DEFAULT_OPS_URL).toString();
}

export interface DmDecisionInput {
  inGuild: boolean;
  authorIsBot: boolean;
  isWebhook: boolean;
}

/** Only human messages in a DM with the bot are reported. */
export function shouldReportDm(input: DmDecisionInput): boolean {
  return !input.inGuild && !input.authorIsBot && !input.isWebhook;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Report one DM, retrying briefly. The ops box also backfills known DM channels. */
export async function reportDm(
  channelId: string,
  messageId: string,
  delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<boolean> {
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const response = await fetch(`${dmInboxApiBase()}/poke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, messageId }),
        signal: AbortSignal.timeout(POKE_TIMEOUT_MS),
      });
      if (response.ok) return true;
      // A 4xx will not get better on retry.
      if (response.status >= 400 && response.status < 500) {
        console.error(`[dm-inbox] poke rejected: ${response.status}`);
        return false;
      }
    } catch (err) {
      if (attempt === delays.length) console.error("[dm-inbox] poke failed:", err);
    }
    if (attempt < delays.length) await sleep(delays[attempt]);
  }
  return false;
}

export async function handleDirectMessage(message: Message): Promise<void> {
  const report = shouldReportDm({
    inGuild: Boolean(message.guild),
    authorIsBot: message.author.bot,
    isWebhook: Boolean(message.webhookId),
  });
  if (!report) return;
  await reportDm(message.channelId, message.id);
}
