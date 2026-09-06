// The ticket intake modal, shared by /ticket and the ticket-panel buttons so the
// two entry points can never drift apart on what they ask for.

import {
  ActionRowBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import type { TicketCategory } from "./ticketStore.js";
import {
  TICKET_PLATFORMS,
  TICKET_PLATFORM_FIELD_ID,
  categoryNeedsPlatform,
  isTicketPlatform,
  type TicketPlatform,
} from "./ticketPlatform.js";

export const TICKET_MODAL_PREFIX = "ticket_modal_";
export const TICKET_SUBJECT_FIELD_ID = "ticket_subject";
export const TICKET_DESCRIPTION_FIELD_ID = "ticket_description";

const SUBJECT_PLACEHOLDER = "Brief summary of your issue";
const DESCRIPTION_PLACEHOLDER = "Any additional details...";

export function ticketModalId(category: TicketCategory | string): string {
  return `${TICKET_MODAL_PREFIX}${category}`;
}

function subjectInput(withLabel: boolean): TextInputBuilder {
  const input = new TextInputBuilder()
    .setCustomId(TICKET_SUBJECT_FIELD_ID)
    .setPlaceholder(SUBJECT_PLACEHOLDER)
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true);
  return withLabel ? input.setLabel("Subject") : input;
}

function descriptionInput(withLabel: boolean): TextInputBuilder {
  const input = new TextInputBuilder()
    .setCustomId(TICKET_DESCRIPTION_FIELD_ID)
    .setPlaceholder(DESCRIPTION_PLACEHOLDER)
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(false);
  return withLabel ? input.setLabel("Description (optional)") : input;
}

function platformSelect(): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(TICKET_PLATFORM_FIELD_ID)
    .setPlaceholder("Select where you are playing...")
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true)
    .addOptions(
      TICKET_PLATFORMS.map((p) => ({
        label: p.label,
        value: p.value,
        description: p.description,
        emoji: p.emoji,
      })),
    );
}

/**
 * The real intake modal. Bug reports carry a platform picker; moderation and
 * mechanics tickets do not, because the answer would not change anything.
 *
 * Uses label-wrapped components (the only modal shape that can hold a select
 * menu), so every field here is wrapped. Mixing these with bare action rows is
 * not a supported payload.
 */
export function buildTicketModal(category: TicketCategory): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(ticketModalId(category)).setTitle("Open a Ticket");

  if (categoryNeedsPlatform(category)) {
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Where are you playing?")
        .setDescription("Tells us which build to reproduce this on")
        .setStringSelectMenuComponent(platformSelect()),
    );
  }

  modal.addLabelComponents(
    new LabelBuilder().setLabel("Subject").setTextInputComponent(subjectInput(false)),
    new LabelBuilder()
      .setLabel("Description (optional)")
      .setTextInputComponent(descriptionInput(false)),
  );

  return modal;
}

/**
 * Text-only modal in the shape this bot used before the platform picker.
 * Kept purely as a fallback: losing the platform answer is survivable, losing
 * the whole intake form is not.
 */
export function buildLegacyTicketModal(category: TicketCategory): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(ticketModalId(category))
    .setTitle("Open a Ticket")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput(true)),
    );
}

/** Show the intake modal, degrading to the text-only form if Discord rejects it. */
export async function showTicketModal(
  interaction: MessageComponentInteraction,
  category: TicketCategory,
): Promise<void> {
  try {
    await interaction.showModal(buildTicketModal(category));
  } catch (error) {
    console.error("Ticket modal rejected, retrying without the platform picker:", error);
    await interaction.showModal(buildLegacyTicketModal(category));
  }
}

/** Read a field that may legitimately be absent from the submitted modal. */
function optionalField<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

export interface TicketModalFields {
  subject: string;
  description?: string;
  platform?: TicketPlatform;
}

export function readTicketModalFields(interaction: ModalSubmitInteraction): TicketModalFields {
  const platform = optionalField(() =>
    interaction.fields.getStringSelectValues(TICKET_PLATFORM_FIELD_ID)[0],
  );
  return {
    subject: interaction.fields.getTextInputValue(TICKET_SUBJECT_FIELD_ID),
    description:
      optionalField(() => interaction.fields.getTextInputValue(TICKET_DESCRIPTION_FIELD_ID)) ||
      undefined,
    platform: isTicketPlatform(platform) ? platform : undefined,
  };
}
