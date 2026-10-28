import type { Message } from "discord.js";
import { askAnswerRecord, registerAskAnswer, type AnswerRecord } from "./ask-continuation-store.js";
import { runAskFromMessage, safePayload } from "./ask-flow.js";
import { consumeReplyWatch } from "./ask-reply-watch.js";
import { ASK_MAX_QUESTION } from "./ask-safety.js";

// Reply-to-continue: replying to one of the bot's Ask answers continues that
// conversation, no slash command needed. The registry remembers which bot
// messages are Ask answers and who asked, so a stranger's reply or a reply to
// any other bot message does nothing.

export { registerAskAnswer };

export interface ContinuationCheck {
  authorId: string;
  authorIsBot: boolean;
  repliedToMessageId: string | null;
  content: string;
}

/** Pure gate, unit-testable: is this message a follow-up to a tracked answer by its asker? */
export function continuationFor(check: ContinuationCheck): AnswerRecord | null {
  if (check.authorIsBot || !check.repliedToMessageId) return null;
  const record = askAnswerRecord(check.repliedToMessageId);
  if (!record || record.userId !== check.authorId) return null;
  const question = String(check.content || "").trim();
  if (question.length < 5) return null;
  return record;
}

/** MessageCreate hook. Fail-quiet: a broken follow-up must never crash the bot. */
export async function handleAskContinuation(message: Message): Promise<void> {
  try {
    // A yes or no to Keir's pending offer or draft is not a new question.
    if (consumeReplyWatch(message)) return;
    const record = continuationFor({
      authorId: message.author.id,
      authorIsBot: message.author.bot,
      repliedToMessageId: message.reference?.messageId ?? null,
      content: message.content,
    });
    if (!record) return;

    const question = message.content.trim();
    if (question.length > ASK_MAX_QUESTION) {
      await message.reply(safePayload(`Follow-ups are limited to ${ASK_MAX_QUESTION} characters. Shorten it and reply again.`));
      return;
    }
    await runAskFromMessage(message, question);
  } catch (error) {
    console.error("[ask] continuation handler error:", error instanceof Error ? error.message : String(error));
  }
}
