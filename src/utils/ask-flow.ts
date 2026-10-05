import type { Message, MessageComponentInteraction, User } from "discord.js";
import { resolveAskIdentity, type AskIdentity } from "./ask-context.js";
import { registerAskAnswer } from "./ask-continuation-store.js";
import { AskProgressReporter } from "./ask-progress.js";
import { deliverAskAnswer, requestAsk, type AskMessagePayload, type AskMode, type AskSink } from "./ask-runtime.js";
import { ASK_MENTIONS, acquireAskSlot, askErrorMessage } from "./ask-safety.js";

/**
 * One Ask, start to finish, for every entry point: the slash command, a reply
 * to an answer, and a suggested follow-up button. Callers own the placeholder
 * message and the routes; this owns identity, streaming, delivery and errors.
 */
export interface AskFlowInput {
  user: User;
  channelId: string;
  question: string;
  responseLength: string;
  mode: AskMode;
  useMcp: boolean;
  /** The placeholder already only reaches the asker (ephemeral). */
  isPrivate: boolean;
  characterName?: string | null;
  subjectUser?: User | null;
  /** Unique per answer; scopes button custom ids. */
  scopeId: string;
  /** Replaces the placeholder (progress, then the answer). */
  placeholder: (payload: AskMessagePayload) => Promise<Message>;
  /** Further messages after the first. */
  more: (payload: AskMessagePayload) => Promise<unknown>;
  /** A route only the asker sees, for staff-access answers to public requests. */
  privateSink: (() => AskSink) | null;
}

/** Every Ask message goes out with mentions disabled. */
export function safePayload(payload: AskMessagePayload | string): AskMessagePayload & { allowedMentions: typeof ASK_MENTIONS } {
  const body = typeof payload === "string" ? { content: payload } : payload;
  return { ...body, allowedMentions: ASK_MENTIONS };
}

async function identities(input: AskFlowInput): Promise<{ requester?: AskIdentity; subject?: AskIdentity }> {
  const requesterPromise = resolveAskIdentity(input.user, undefined, input.characterName);
  const subjectPromise = input.subjectUser
    ? input.subjectUser.id === input.user.id
      ? requesterPromise
      : resolveAskIdentity(input.subjectUser)
    : Promise.resolve(undefined);
  const [requester, subject] = await Promise.all([requesterPromise, subjectPromise]);
  return { requester, subject };
}

export async function runAskFlow(input: AskFlowInput): Promise<void> {
  const progress = new AskProgressReporter(content => input.placeholder({ content }));
  try {
    const { requester, subject } = await identities(input);
    const result = await requestAsk({
      question: input.question,
      responseLength: input.responseLength,
      mode: input.mode,
      useMcp: input.useMcp,
      requester,
      subject,
      discordId: input.user.id,
      discordUsername: input.user.username,
      channelId: input.channelId,
      progress,
    });
    await progress.stop();

    const delivered = await deliverAskAnswer({
      scopeId: input.scopeId,
      userId: input.user.id,
      username: input.user.username,
      question: input.question,
      requester,
      sink: { first: input.placeholder, more: input.more },
      isPrivate: input.isPrivate,
      privateSink: input.privateSink,
      onFollowup: (question, button) => runFollowupFromButton(question, button, input),
    }, result);
    // Replying to a public answer continues the conversation. Private answers
    // cannot be replied to, so they are not tracked.
    if (delivered && !input.isPrivate && !result.moderator) {
      registerAskAnswer(delivered.id, { userId: input.user.id, question: input.question });
    }
  } catch (error) {
    await progress.stop();
    console.error("[ask] answer failed:", error instanceof Error ? error.message : String(error));
    try {
      await input.placeholder({ content: askErrorMessage(error), files: [], embeds: [], components: [] });
    } catch { /* placeholder gone or interaction expired */ }
  }
}

/** A suggested follow-up button: same settings, same conversation, new answer. */
export async function runFollowupFromButton(
  question: string,
  button: MessageComponentInteraction,
  parent: AskFlowInput,
): Promise<void> {
  const gate = acquireAskSlot(button.user.id);
  if (!gate.ok) {
    await button.reply({ content: gate.message, ephemeral: true });
    return;
  }
  try {
    await button.deferReply({ ephemeral: parent.isPrivate });
    const placeholder = (payload: AskMessagePayload) => button.editReply(safePayload(payload));
    await placeholder({ content: `> ${question.replace(/\n/g, " ").slice(0, 300)}\nThinking…` });
    await runAskFlow({
      ...parent,
      question,
      scopeId: button.id,
      placeholder,
      more: payload => button.followUp({ ...safePayload(payload), ephemeral: parent.isPrivate }),
      privateSink: parent.isPrivate ? null : () => ({
        first: payload => button.followUp({ ...safePayload(payload), ephemeral: true }),
        more: payload => button.followUp({ ...safePayload(payload), ephemeral: true }),
      }),
    });
  } finally {
    gate.release();
  }
}
