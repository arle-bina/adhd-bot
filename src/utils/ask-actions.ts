import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Message,
  type MessageComponentInteraction,
  type MessageEditOptions,
  type User,
} from "discord.js";
import { ApiError, apiPostAskSite } from "./api-base.js";
import { followupLabel } from "./ask-presentation.js";
import { startReplyWatch, ASK_REPLY_WATCH_MS, type ReplyWatch } from "./ask-reply-watch.js";
import { ASK_MENTIONS } from "./ask-safety.js";

// Keir can file a suggestion or open a ticket for the asker, but only after
// they say so. A drafted action arrives as `proposedAction`; an answer that
// merely spots something worth filing carries an `offer`. Either one waits
// for a button or a plain chat yes/no, then always ends.

export type AskActionKind = "suggestion" | "ticket";

export interface ProposedAction {
  id: string;
  kind: AskActionKind;
  title: string;
  description: string;
  category: string;
  gameSystem?: string;
  expiresAt?: string | number;
}

export interface AskOffer {
  kind: AskActionKind;
  label?: string;
}

export interface ActionReceipt {
  kind: AskActionKind;
  number: number | string;
  url?: string;
}

/** The text an offer sends as the next question. The engine treats it as a free action turn. */
export const OFFER_QUESTION: Record<AskActionKind, string> = {
  suggestion: "File this as a suggestion",
  ticket: "Open a support ticket",
};

const KIND_LABEL: Record<AskActionKind, string> = { suggestion: "Suggestion", ticket: "Support ticket" };

export function isProposedAction(value: unknown): value is ProposedAction {
  const action = value as ProposedAction | null;
  return Boolean(action && typeof action === "object" && typeof action.id === "string" && action.id
    && (action.kind === "suggestion" || action.kind === "ticket") && typeof action.title === "string");
}

export function isAskOffer(value: unknown): value is AskOffer {
  const offer = value as AskOffer | null;
  return Boolean(offer && typeof offer === "object" && (offer.kind === "suggestion" || offer.kind === "ticket"));
}

function prettyCategory(value: string): string {
  return value.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
}

/** The draft card. Title and description are model-drafted, so lengths are capped. */
export function draftNote(isPrivate: boolean): string {
  return isPrivate
    ? "Tap File it to send, or No thanks to drop it. Expires in 3 minutes."
    : "Tap File it or reply yes to send. Reply no to drop it. Expires in 3 minutes.";
}

export function actionEmbed(action: ProposedAction, note = draftNote(false)): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setAuthor({ name: `${KIND_LABEL[action.kind]} draft` })
    .setTitle(action.title.slice(0, 256) || "Untitled")
    .setDescription(String(action.description || "").slice(0, 3000) || "No description.")
    .setFooter({ text: note });
  const meta = [action.category ? prettyCategory(action.category) : "", action.gameSystem ? prettyCategory(action.gameSystem) : ""]
    .filter(Boolean).join(" · ");
  if (meta) embed.addFields({ name: "Category", value: meta.slice(0, 1024) });
  return embed;
}

export function actionRow(scopeId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ask-act-file:${scopeId}`).setLabel("File it").setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`ask-act-no:${scopeId}`).setLabel("No thanks").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  );
}

export function offerRow(scopeId: string, offer: AskOffer, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ask-offer:${scopeId}`)
      .setLabel(followupLabel(offer.label || OFFER_QUESTION[offer.kind]))
      .setStyle(ButtonStyle.Primary).setDisabled(disabled),
  );
}

function receiptRow(receipt: ActionReceipt) {
  if (!receipt.url || !/^https:\/\//.test(receipt.url)) return [];
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(receipt.kind === "ticket" ? "Open ticket" : "View suggestion").setURL(receipt.url),
  )];
}

export function receiptText(receipt: ActionReceipt): string {
  return receipt.kind === "ticket" ? `Ticket #${receipt.number} opened.` : `Suggestion #${receipt.number} filed.`;
}

export type ConfirmOutcome = { ok: true; receipt: ActionReceipt } | { ok: false; message: string };

function bodyOf(error: unknown): { receipt?: ActionReceipt; error?: string } | null {
  if (!(error instanceof ApiError)) return null;
  try { return JSON.parse(error.responseBody) as { receipt?: ActionReceipt; error?: string }; } catch { return null; }
}

/** Confirm a drafted action. A 409 means it was already filed and carries the stored receipt. */
export async function confirmAskAction(actionId: string, discordId: string): Promise<ConfirmOutcome> {
  try {
    const response = await apiPostAskSite<{ ok?: boolean; receipt?: ActionReceipt }>(
      "/api/discord-ask/action/confirm", { actionId, discordId }, 30_000);
    if (response.receipt) return { ok: true, receipt: response.receipt };
    return { ok: false, message: "Ask Keir did not confirm that it was filed. Try asking again." };
  } catch (error) {
    const body = bodyOf(error);
    if (body?.receipt) return { ok: true, receipt: body.receipt };
    const status = error instanceof ApiError ? error.status : 0;
    console.error("[ask] action confirm failed:", error instanceof Error ? error.message : String(error));
    // The engine writes its 4xx errors for players (daily action limit, expired draft).
    if (status >= 400 && status < 500 && typeof body?.error === "string" && body.error.trim() && !/https?:\/\//.test(body.error)) {
      return { ok: false, message: body.error.trim().slice(0, 300) };
    }
    return { ok: false, message: "I couldn't file that just now. Nothing was sent; ask again in a minute." };
  }
}

export async function cancelAskAction(actionId: string, discordId: string): Promise<void> {
  try {
    await apiPostAskSite("/api/discord-ask/action/cancel", { actionId, discordId });
  } catch (error) {
    // The draft expires on its own; a failed cancel needs no player-facing error.
    console.error("[ask] action cancel failed:", error instanceof Error ? error.message : String(error));
  }
}

/** What the card edits change; also valid for an interaction webhook edit. */
export type CardEdit = Pick<MessageEditOptions, "content" | "embeds" | "components" | "allowedMentions">;

export interface AskActionContext {
  user: User;
  channelId: string;
  /** Private answers skip the chat watch: a public "yes" would leak the private exchange. */
  isPrivate: boolean;
  scopeId: string;
  /** Posts the card after the answer. */
  post: (payload: { content: string; embeds?: EmbedBuilder[]; components?: ActionRowBuilder<ButtonBuilder>[] }) => Promise<Message>;
  /** Sends the offer text through the normal Ask flow. */
  runOfferFromButton: (question: string, button: MessageComponentInteraction) => Promise<void>;
  runOfferFromMessage: (question: string, message: Message) => Promise<void>;
  /** Edits the card outside a button click. Defaults to a plain message edit, which cannot reach private cards. */
  editCard?: (card: Message, payload: CardEdit) => Promise<unknown>;
  timeoutMs?: number;
}

function guarded(task: () => Promise<void>): void {
  task().catch(error => console.error("[ask] action control failed:", error instanceof Error ? error.message : String(error)));
}

function editCard(context: AskActionContext, card: Message, payload: CardEdit): Promise<unknown> {
  return context.editCard ? context.editCard(card, payload) : card.edit(payload);
}

/** Wires a card's button collector and chat watch to one settle-once lifecycle. */
function lifecycle(card: Message, context: AskActionContext, onExpire: () => Promise<void>) {
  const timeoutMs = context.timeoutMs ?? ASK_REPLY_WATCH_MS;
  let settled = false;
  let watch: ReplyWatch | null = null;
  const collector = card.createMessageComponentCollector({
    time: timeoutMs,
    filter: button => button.customId.endsWith(`:${context.scopeId}`),
  });
  const settle = (): boolean => {
    if (settled) return false;
    settled = true;
    watch?.end("button");
    collector.stop("settled");
    return true;
  };
  collector.on("end", () => {
    if (settle()) void onExpire();
  });
  return {
    collector,
    settle,
    watchReplies(onReply: Parameters<typeof startReplyWatch>[0]["onReply"]) {
      if (context.isPrivate) return;
      watch = startReplyWatch({
        userId: context.user.id,
        channelId: context.channelId,
        timeoutMs,
        onReply: (intent, message) => settle() ? onReply(intent, message) : undefined,
        onExpire: () => { if (settle()) return onExpire(); },
      });
    },
  };
}

async function presentProposed(context: AskActionContext, action: ProposedAction): Promise<void> {
  const card = await context.post({ content: "", embeds: [actionEmbed(action, draftNote(context.isPrivate))], components: [actionRow(context.scopeId)] });
  // A clicked button edits through its interaction, which also works on
  // private (ephemeral) cards that a plain message edit cannot reach.
  const edit = async (note: string, color: number, receipt?: ActionReceipt, button?: MessageComponentInteraction) => {
    const payload = {
      embeds: [actionEmbed(action, note).setColor(color)],
      components: receipt ? receiptRow(receipt) : [actionRow(context.scopeId, true)],
      allowedMentions: ASK_MENTIONS,
    };
    try {
      await (button ? button.editReply(payload) : editCard(context, card, payload));
    } catch { /* message gone */ }
  };
  const confirm = async (button?: MessageComponentInteraction): Promise<ConfirmOutcome> => {
    const outcome = await confirmAskAction(action.id, context.user.id);
    if (outcome.ok) await edit(receiptText(outcome.receipt), 0x22c55e, outcome.receipt, button);
    else await edit(outcome.message, 0xef4444, undefined, button);
    return outcome;
  };
  const cancel = async (button?: MessageComponentInteraction) => {
    await edit("Not filed.", 0x64748b, undefined, button);
    await cancelAskAction(action.id, context.user.id);
  };

  const flow = lifecycle(card, context, () => cancel());
  flow.collector.on("collect", button => guarded(async () => {
    if (button.user.id !== context.user.id) {
      await button.reply({ content: "Only the person who asked can use these controls.", ephemeral: true });
      return;
    }
    if (!flow.settle()) return;
    // Ack inside Discord's 3s window; the confirm call can take longer.
    await button.deferUpdate();
    if (button.customId.startsWith("ask-act-file:")) await confirm(button);
    else await cancel(button);
  }));
  flow.watchReplies(async (intent, message) => {
    if (intent === "no") {
      await cancel();
      await message.reply({ content: "Okay, not filed.", allowedMentions: ASK_MENTIONS });
      return;
    }
    const outcome = await confirm();
    await message.reply({ content: outcome.ok ? receiptText(outcome.receipt) : outcome.message, allowedMentions: ASK_MENTIONS });
  });
}

async function presentOffer(context: AskActionContext, offer: AskOffer): Promise<void> {
  const question = OFFER_QUESTION[offer.kind];
  const prompt = `${offer.kind === "ticket" ? "Want me to open a support ticket about this?" : "Want me to file this as a suggestion?"} ${
    context.isPrivate ? "Tap the button." : "Tap the button or reply yes."}`;
  const card = await context.post({ content: prompt, components: [offerRow(context.scopeId, offer)] });
  const disable = async () => {
    try { await editCard(context, card, { components: [offerRow(context.scopeId, offer, true)], allowedMentions: ASK_MENTIONS }); } catch { /* message gone */ }
  };
  const flow = lifecycle(card, context, disable);
  flow.collector.on("collect", button => guarded(async () => {
    if (button.user.id !== context.user.id) {
      await button.reply({ content: "Only the person who asked can use these controls.", ephemeral: true });
      return;
    }
    if (!flow.settle()) return;
    await disable();
    await context.runOfferFromButton(question, button);
  }));
  flow.watchReplies(async (intent, message) => {
    await disable();
    if (intent === "yes") await context.runOfferFromMessage(question, message);
  });
}

/** Shows a drafted action or an offer after an answer. Never throws. */
export async function presentAskAction(context: AskActionContext, result: { proposedAction?: unknown; offer?: unknown }): Promise<void> {
  try {
    if (isProposedAction(result.proposedAction)) await presentProposed(context, result.proposedAction);
    else if (isAskOffer(result.offer)) await presentOffer(context, result.offer);
  } catch (error) {
    console.error("[ask] action card failed:", error instanceof Error ? error.message : String(error));
  }
}
