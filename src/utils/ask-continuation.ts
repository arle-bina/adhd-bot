import type { Message } from "discord.js";
import { resolveAskIdentity } from "./ask-context.js";
import { AskProgressReporter } from "./ask-progress.js";
import { deliverAskAnswer, requestAsk } from "./ask-runtime.js";

// Reply-to-continue: replying to one of the bot's Ask answers continues that
// conversation, no slash command needed. The registry remembers which bot
// messages are Ask answers and who asked, so a stranger's reply or a reply to
// any other bot message does nothing.

interface AnswerRecord {
  userId: string;
  question: string;
}

const MAX_TRACKED = 500;
const answers = new Map<string, AnswerRecord>();

export function registerAskAnswer(messageId: string, record: AnswerRecord): void {
  answers.set(messageId, record);
  if (answers.size > MAX_TRACKED) {
    const oldest = answers.keys().next().value;
    if (oldest) answers.delete(oldest);
  }
}

export interface ContinuationCheck {
  authorId: string;
  authorIsBot: boolean;
  repliedToMessageId: string | null;
  content: string;
}

/** Pure gate, unit-testable: is this message a follow-up to a tracked answer by its asker? */
export function continuationFor(check: ContinuationCheck): AnswerRecord | null {
  if (check.authorIsBot || !check.repliedToMessageId) return null;
  const record = answers.get(check.repliedToMessageId);
  if (!record || record.userId !== check.authorId) return null;
  const question = String(check.content || "").trim();
  if (question.length < 5 || question.length > 2000) return null;
  return record;
}

/** MessageCreate hook. Fail-quiet: a broken follow-up must never crash the bot. */
export async function handleAskContinuation(message: Message): Promise<void> {
  try {
    const record = continuationFor({
      authorId: message.author.id,
      authorIsBot: message.author.bot,
      repliedToMessageId: message.reference?.messageId ?? null,
      content: message.content,
    });
    if (!record) return;

    const question = message.content.trim();
    const thinking = await message.reply("Thinking…");
    const progress = new AskProgressReporter(content => thinking.edit(content));
    try {
      const requester = await resolveAskIdentity(message.author);
      const result = await requestAsk({
        question,
        responseLength: "concise",
        requester,
        discordId: message.author.id,
        discordUsername: message.author.username,
        channelId: message.channelId,
        progress,
      });
      await progress.stop();
      const delivered = await deliverAskAnswer({
        scopeId: message.id,
        userId: message.author.id,
        username: message.author.username,
        question,
        edit: payload => thinking.edit(payload),
        followUp: async content => message.channel.isSendable() ? message.channel.send(content) : undefined,
      }, result);
      registerAskAnswer(delivered.id, { userId: message.author.id, question });
    } catch (error) {
      await progress.stop();
      const reason = error instanceof Error ? error.message : String(error);
      console.error("[ask] continuation failed:", reason);
      try { await thinking.edit(`I couldn't answer that follow-up: ${reason.slice(0, 180)}`); } catch { /* message gone */ }
    }
  } catch (error) {
    console.error("[ask] continuation handler error:", error instanceof Error ? error.message : String(error));
  }
}
