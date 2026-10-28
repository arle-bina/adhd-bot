import type { Message } from "discord.js";

// After Keir drafts or offers an action, the asker may answer in plain chat
// ("yes", "nah") instead of tapping a button. A watch listens for that one
// reply from the same person in the same channel, for a few minutes only.
// Every way a watch can finish (reply, button, timeout, a newer watch for the
// same person) runs through one idempotent end, so no timer outlives it.

export const ASK_REPLY_WATCH_MS = 3 * 60_000;

export type ReplyIntent = "yes" | "no";

const NEGATIVE = /^(?:no|nah|nope|cancel|don'?t|do not|never ?mind|nvm|no thanks?|stop)\b/;
const AFFIRMATIVE = /^(?:yes|yeah|yep|yup|ya|sure|do it|file it|send it|submit it|open it|go ahead|go for it|please|y|ok|okay|k|confirm)\b/;

/**
 * Pure: read a short chat reply as yes, no, or neither. Only short replies
 * count, and questions never do, so "ok so how do unions work?" is not a yes.
 */
export function replyIntent(text: string): ReplyIntent | null {
  const clean = String(text || "")
    .replace(/<@[!&]?\d+>/g, " ")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z' ?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean || clean.includes("?") || clean.split(" ").length > 5) return null;
  if (NEGATIVE.test(clean)) return "no";
  if (AFFIRMATIVE.test(clean)) return "yes";
  return null;
}

export type WatchEndReason = "reply" | "button" | "timeout" | "superseded";

export interface ReplyWatchOptions {
  userId: string;
  channelId: string;
  timeoutMs?: number;
  /** A yes or no from the watched person. The watch has already ended. */
  onReply: (intent: ReplyIntent, message: Message) => Promise<void> | void;
  /** Runs once when the watch ends for any reason other than a reply or a button. */
  onExpire: (reason: "timeout" | "superseded") => Promise<void> | void;
}

export interface ReplyWatch {
  /** Idempotent. Clears the timer and frees the slot. */
  end(reason: WatchEndReason): void;
  readonly active: boolean;
}

interface Entry { options: ReplyWatchOptions; watch: ReplyWatch }

const watches = new Map<string, Entry>();

function runQuietly(task: () => Promise<void> | void): void {
  Promise.resolve().then(task).catch(error => {
    console.error("[ask] reply watch handler failed:", error instanceof Error ? error.message : String(error));
  });
}

/** One watch per person: starting a new one ends the previous as superseded. */
export function startReplyWatch(options: ReplyWatchOptions): ReplyWatch {
  watches.get(options.userId)?.watch.end("superseded");
  let active = true;
  const timer = setTimeout(() => watch.end("timeout"), options.timeoutMs ?? ASK_REPLY_WATCH_MS);
  timer.unref?.();
  const watch: ReplyWatch = {
    end(reason) {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      if (watches.get(options.userId)?.watch === watch) watches.delete(options.userId);
      if (reason === "timeout" || reason === "superseded") runQuietly(() => options.onExpire(reason));
    },
    get active() { return active; },
  };
  watches.set(options.userId, { options, watch });
  return watch;
}

/**
 * MessageCreate hook. Returns true when the message answered a watch, so the
 * caller does not also treat it as a new question.
 */
export function consumeReplyWatch(message: Pick<Message, "author" | "channelId" | "content">): boolean {
  if (message.author.bot) return false;
  const entry = watches.get(message.author.id);
  if (!entry || entry.options.channelId !== message.channelId) return false;
  const intent = replyIntent(message.content);
  if (!intent) return false;
  entry.watch.end("reply");
  runQuietly(() => entry.options.onReply(intent, message as Message));
  return true;
}

/** Test hook. */
export function _activeReplyWatches(): number {
  return watches.size;
}
