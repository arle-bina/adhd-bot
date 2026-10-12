// Keir decision buttons. The ops box DMs the owner (and, after three hours, the
// delegate) a "Decision needed" message with Approve / Reject / Explain buttons.
// Button clicks only reach this bot, so this side records the verdict on that
// same bot-authored DM and pokes the ops box, which re-reads the DM from Discord
// and acts. Discord vouches for who clicked; nothing in the poke is trusted.

import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { pokeSummon } from "./summon.js";

export const DECISION_PREFIX = "keir_decision:";
export const DECISION_MODAL_PREFIX = "keir_decision_modal:";
const OWNER_ID = "333052320252297216";
const DELEGATE_ID = "565289871799746593";
const CUSTOM_ID = /^keir_decision:(approve|reject|explain):([a-f0-9]{12})$/;
const MODAL_ID = /^keir_decision_modal:([a-f0-9]{12})$/;

/** Who may answer: the owner, and the delegate who answers on the owner's behalf. */
export function decisionAnswerers(): string[] {
  const extra = (process.env.KEIR_DECISION_USERS || "").split(",").map((s) => s.trim()).filter((s) => /^\d{15,22}$/.test(s));
  return [...new Set([OWNER_ID, DELEGATE_ID, ...extra])];
}

export function parseDecisionButton(customId: string): { verdict: "approve" | "reject" | "explain"; id: string } | null {
  const m = CUSTOM_ID.exec(customId);
  return m ? { verdict: m[1] as "approve" | "reject" | "explain", id: m[2] } : null;
}

/** The verdict line the ops box parses. Its wording is a contract with the box. */
export function verdictLine(verdict: "approve" | "reject" | "explain", userId: string, text = ""): string {
  const stamp = `<t:${Math.floor(Date.now() / 1000)}:R>`;
  if (verdict === "approve") return `\n\n**Decision:** ✅ Approved by <@${userId}> ${stamp}`;
  if (verdict === "reject") return `\n\n**Decision:** ❌ Rejected by <@${userId}> ${stamp}`;
  // Keep the explanation from smuggling a second verdict line.
  const safe = text.replace(/\*\*Decision:\*\*/gi, "Decision:").trim().slice(0, 1500);
  return `\n\n**Decision:** 💬 Explain from <@${userId}> ${stamp}: ${safe}`;
}

function alreadyAnswered(content: string): boolean {
  return /\n\n\*\*Decision:\*\* /.test(content) || /\n\nAnswered by <@\d+>/.test(content);
}

export async function handleDecisionButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseDecisionButton(interaction.customId);
  if (!parsed) return;
  if (!decisionAnswerers().includes(interaction.user.id)) {
    await interaction.reply({ content: "Only Egg or Danica can answer this.", ephemeral: true });
    return;
  }
  if (interaction.message.author.id !== interaction.client.user.id || alreadyAnswered(interaction.message.content)) {
    await interaction.reply({ content: "This decision has already been answered.", ephemeral: true });
    return;
  }
  if (parsed.verdict === "explain") {
    const modal = new ModalBuilder().setCustomId(`${DECISION_MODAL_PREFIX}${parsed.id}`).setTitle("Tell Keir what to do");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("explain").setLabel("Your answer or instructions").setStyle(TextInputStyle.Paragraph).setMaxLength(1500).setRequired(true),
      ),
    );
    await interaction.showModal(modal);
    return;
  }
  await interaction.update({ content: (interaction.message.content + verdictLine(parsed.verdict, interaction.user.id)).slice(0, 2000), components: [] });
  await pokeSummon(interaction.channelId, interaction.message.id);
}

export async function handleDecisionModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!MODAL_ID.test(interaction.customId)) return;
  if (!decisionAnswerers().includes(interaction.user.id) || !interaction.isFromMessage()) {
    await interaction.reply({ content: "Only Egg or Danica can answer this.", ephemeral: true });
    return;
  }
  const message = interaction.message;
  if (message.author.id !== interaction.client.user.id || alreadyAnswered(message.content)) {
    await interaction.reply({ content: "This decision has already been answered.", ephemeral: true });
    return;
  }
  const text = interaction.fields.getTextInputValue("explain");
  await interaction.update({ content: (message.content + verdictLine("explain", interaction.user.id, text)).slice(0, 2000), components: [] });
  await pokeSummon(interaction.channelId ?? message.channelId, message.id);
}
