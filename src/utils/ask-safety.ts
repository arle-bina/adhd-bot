/**
 * Guard rails shared by every Ask entry point (slash command, reply follow-up,
 * suggested follow-up button).
 */

import type { MessageMentionOptions } from "discord.js";
import { ApiError, AskServerError } from "./api-base.js";

/**
 * Ask output is model-written text. A prompted answer containing `@everyone`
 * or a role mention must never ping anyone, and replying to the asker should
 * not ping them either: they are watching the message already.
 */
export const ASK_MENTIONS: MessageMentionOptions = { parse: [], repliedUser: false };

/** Ask questions are capped at 500 characters by the engine. */
export const ASK_MAX_QUESTION = 500;

/** Minimum gap between Ask requests from one person, across entry points. */
export const ASK_COOLDOWN_MS = Number(process.env.ASK_COOLDOWN_MS || 8_000);

const inFlight = new Set<string>();
const lastStart = new Map<string, number>();

export type AskGate =
  | { ok: true; release: () => void }
  | { ok: false; message: string };

/**
 * One Ask at a time per person, plus a short cooldown. The engine also limits
 * daily questions, but a burst of parallel follow-ups would otherwise tie up
 * the bot's stream slots for minutes.
 */
export function acquireAskSlot(userId: string, now = Date.now()): AskGate {
  if (inFlight.has(userId)) {
    return { ok: false, message: "You already have an answer being written. Wait for it to finish, then ask again." };
  }
  const since = now - (lastStart.get(userId) ?? 0);
  if (since < ASK_COOLDOWN_MS) {
    const seconds = Math.ceil((ASK_COOLDOWN_MS - since) / 1000);
    return { ok: false, message: `Give it ${seconds}s before the next question.` };
  }
  inFlight.add(userId);
  lastStart.set(userId, now);
  if (lastStart.size > 5000) {
    for (const [key, at] of lastStart) if (now - at > ASK_COOLDOWN_MS) lastStart.delete(key);
  }
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      inFlight.delete(userId);
    },
  };
}

/** Optional channel allowlist. Unset means every channel the command is visible in. */
export function askChannelAllowed(channelId: string | null, isStaff: boolean): boolean {
  if (isStaff) return true;
  const allowed = String(process.env.ASK_CHANNEL_IDS || "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);
  if (!allowed.length) return true;
  return channelId !== null && allowed.includes(channelId);
}

export function askChannelHint(): string {
  const allowed = String(process.env.ASK_CHANNEL_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
  return allowed.length
    ? `Ask works in ${allowed.map(id => `<#${id}>`).join(", ")}, or use \`private: True\` to get an answer only you can see.`
    : "";
}

/**
 * Turn any failure into one sentence a player can act on. Raw error text can
 * carry upstream bodies, stack fragments, or internal URLs, so it is logged
 * and never posted.
 */
function playerFacingServerText(error: unknown): string | null {
  // The Ask engine writes its 4xx `error` strings and streamed error events
  // for players (quota left, scenario format, models busy). Those are safe to
  // relay; anything else is not.
  if (error instanceof AskServerError) return error.message.slice(0, 300) || null;
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    try {
      const body = JSON.parse(error.responseBody) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim()) return body.error.trim().slice(0, 300);
    } catch { /* not JSON */ }
  }
  return null;
}

export function askErrorMessage(error: unknown): string {
  const relayed = playerFacingServerText(error);
  if (relayed && !/https?:\/\/|\bat \S+:\d+/.test(relayed)) return relayed;
  const status = error instanceof ApiError ? error.status : 0;
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (status === 429 || /\b429\b|rate.?limit|busy/i.test(text)) {
    return "Ask is busy right now. Try again in a minute; this did not use one of your questions.";
  }
  if (status === 402 || /quota|daily limit|questions left|out of questions/i.test(text)) {
    return "You have used today's Ask questions. They reset daily; supporters get more.";
  }
  if (status === 401 || status === 403) {
    return "Ask could not verify this request. Try again later.";
  }
  if (/timeout|timed out|aborted/i.test(text)) {
    return "That answer took too long and was stopped. Try a narrower question, or ask again.";
  }
  if (status === 400 && /question required/i.test(text)) {
    return "That question was empty. Ask again with a question.";
  }
  return "Ask could not answer that one. Try again in a moment; failed answers do not use your questions.";
}
