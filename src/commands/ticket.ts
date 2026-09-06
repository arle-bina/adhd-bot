import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
} from "discord.js";
import { createTicket } from "../utils/tickets.js";
import { readTicketModalFields, showTicketModal, ticketModalId } from "../utils/ticketModal.js";
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
        { label: "Moderation Issue", value: "moderation", emoji: "🛡️", description: "Report a moderation concern" },
        { label: "Mechanics Help", value: "mechanics", emoji: "🧩", description: "Ask a question about how a game mechanic works" },
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

    try {
      await showTicketModal(selectInteraction, category);
    } catch (error) {
      console.error("Failed to show the ticket modal:", error);
      return;
    }

    // Wait for modal submission
    try {
      const modalInteraction = await selectInteraction.awaitModalSubmit({
        filter: (m) => m.customId === ticketModalId(category) && m.user.id === interaction.user.id,
        time: 300_000, // 5 minutes to fill out the form
      });

      await modalInteraction.deferReply({ ephemeral: true });

      const result = await createTicket(
        interaction.guild!,
        interaction.user.id,
        interaction.user.username,
        category,
        readTicketModalFields(modalInteraction),
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
