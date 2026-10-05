import type { Message } from "discord.js";
import { askAnswerRecord, registerAskAnswer, type AnswerRecord } from "./ask-continuation-store.js";
import { runAskFlow, safePayload } from "./ask-flow.js";
import { ASK_MAX_QUESTION, acquireAskSlot } from "./ask-safety.js";

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
    const gate = acquireAskSlot(message.author.id);
    if (!gate.ok) {
      await message.reply(safePayload(gate.message));
      return;
    }
    try {
      const thinking = await message.reply(safePayload("Thinking…"));
      const send = async (payload: Parameters<typeof safePayload>[0]) => {
        if (!message.channel.isSendable()) throw new Error("channel not sendable");
        return message.channel.send(safePayload(payload));
      };
      await runAskFlow({
        user: message.author,
        channelId: message.channelId,
        question,
        responseLength: "concise",
        mode: "auto",
        useMcp: true,
        isPrivate: false,
        scopeId: message.id,
        placeholder: payload => thinking.edit(safePayload(payload)),
        more: send,
        // No ephemeral messages outside interactions: a staff-access answer
        // to a follow-up goes by DM.
        privateSink: () => ({
          first: payload => message.author.send(safePayload(payload)),
          more: payload => message.author.send(safePayload(payload)),
        }),
      });
    } finally {
      gate.release();
    }
  } catch (error) {
    console.error("[ask] continuation handler error:", error instanceof Error ? error.message : String(error));
  }
}
