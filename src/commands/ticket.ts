import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
} from "discord.js";
import { createTicket } from "../utils/tickets.js";
import type { TicketCategory } from "../utils/ticketStore.js";

export const cooldown = 30;

export const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Open a support ticket");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: "This command must be used in a server.", ephemeral: true });
    return;
  }

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket_category")
      .setPlaceholder("Select a ticket type...")
      .addOptions(
        { label: "Bug Report", value: "bug", emoji: "🐛", description: "Report a bug or issue" },
        { label: "Suggestion", value: "suggestion", emoji: "💡", description: "Suggest a feature or improvement" },
        { label: "Moderation Issue", value: "moderation", emoji: "🛡️", description: "Report a moderation concern" },
      ),
  );

  const reply = await interaction.reply({
    content: "What type of ticket would you like to open?",
    components: [selectRow],
    ephemeral: true,
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: (i) => i.user.id === interaction.user.id,
    time: 60_000,
    max: 1,
  });

  collector.on("collect", async (selectInteraction) => {
    const category = selectInteraction.values[0] as TicketCategory;

    const modal = new ModalBuilder()
      .setCustomId(`ticket_modal_${category}`)
      .setTitle("Open a Ticket");

    const subjectInput = new TextInputBuilder()
      .setCustomId("ticket_subject")
      .setLabel("Subject")
      .setPlaceholder("Brief summary of your issue")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(true);

    const descriptionInput = new TextInputBuilder()
      .setCustomId("ticket_description")
      .setLabel("Description (optional)")
      .setPlaceholder("Any additional details...")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1000)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
    );

    await selectInteraction.showModal(modal);

    // Wait for modal submission
    try {
      const modalInteraction = await selectInteraction.awaitModalSubmit({
        filter: (m) => m.customId === `ticket_modal_${category}` && m.user.id === interaction.user.id,
        time: 300_000, // 5 minutes to fill out the form
      });

      await modalInteraction.deferReply({ ephemeral: true });

      const subject = modalInteraction.fields.getTextInputValue("ticket_subject");
      const description = modalInteraction.fields.getTextInputValue("ticket_description") || undefined;

      const result = await createTicket(
        interaction.guild!,
        interaction.user.id,
        interaction.user.username,
        category,
        { subject, description },
      );

      if (result.success) {
        await modalInteraction.editReply({ content: `Ticket created: <#${result.channelId}>` });
      } else {
        await modalInteraction.editReply({ content: result.reason });
      }
    } catch {
      // Modal timed out or was dismissed — do nothing
    }
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      interaction.editReply({ content: "Ticket creation timed out.", components: [] }).catch(() => {});
    }
  });
}
