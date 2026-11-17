// Keir answer feedback. Keir's newest answer in a channel carries a row of
// buttons: Great, Helpful, Not helpful, Report a problem. Clicks reach only this
// bot, so this side answers the clicker privately and then sends the ops box the
// interaction token. The ops box reads that private answer back from Discord to
// learn who voted, on which message, and how. Nothing in the poke is trusted.
//
// The first line of the private answer is a contract with the ops box
// (apps/agent/lib/operator/feedback.js in lakeside-ops). Keep the wording.

import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { summonApiBase } from "./summon.js";

export const FEEDBACK_PREFIX = "keir_fb:";
export const FEEDBACK_MODAL_PREFIX = "keir_fb_modal:";
export type FeedbackVote = "great" | "up" | "down" | "report";

const BUTTON_ID = /^keir_fb:(great|up|down|report)$/;
const MODAL_ID = /^keir_fb_modal:(down|report)$/;
const LABEL: Record<FeedbackVote, string> = {
  great: "⭐ Great.",
  up: "👍 Helpful.",
  down: "👎 Not helpful.",
  report: "🚩 Problem reported.",
};

export function parseFeedbackButton(customId: string): FeedbackVote | null {
  const m = BUTTON_ID.exec(customId);
  return m ? (m[1] as FeedbackVote) : null;
}

/** The private confirmation the ops box parses. */
export function feedbackConfirmation(vote: FeedbackVote, reason = ""): string {
  const head = `Thanks, feedback recorded: ${LABEL[vote]}`;
  const clean = reason.replace(/\s+/g, " ").trim().slice(0, 1500);
  return clean ? `${head}\nReason: ${clean}` : head;
}

async function sendToOps(token: string): Promise<void> {
  try {
    const response = await fetch(`${summonApiBase()}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) console.error(`[keir-feedback] ops box answered ${response.status}`);
  } catch (err) {
    console.error("[keir-feedback] could not reach the ops box:", err);
  }
}

export async function handleFeedbackButton(interaction: ButtonInteraction): Promise<void> {
  const vote = parseFeedbackButton(interaction.customId);
  if (!vote) return;
  if (interaction.message.author.id !== interaction.client.user.id) return;
  if (vote === "down" || vote === "report") {
    const modal = new ModalBuilder()
      .setCustomId(`${FEEDBACK_MODAL_PREFIX}${vote}`)
      .setTitle(vote === "report" ? "Report a problem with this answer" : "What was wrong with this answer?");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel(vote === "report" ? "What is the problem?" : "Wrong info, did not help, tone, other?")
          .setPlaceholder(vote === "report" ? "e.g. it gave the wrong number, or said something it should not" : "Optional")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(vote === "report"),
      ),
    );
    await interaction.showModal(modal);
    return;
  }
  await interaction.reply({ content: feedbackConfirmation(vote), ephemeral: true });
  await sendToOps(interaction.token);
}

export async function handleFeedbackModal(interaction: ModalSubmitInteraction): Promise<void> {
  const m = MODAL_ID.exec(interaction.customId);
  if (!m || !interaction.isFromMessage()) return;
  const vote = m[1] as FeedbackVote;
  const reason = interaction.fields.getTextInputValue("reason") || "";
  await interaction.reply({ content: feedbackConfirmation(vote, reason), ephemeral: true });
  await sendToOps(interaction.token);
}
