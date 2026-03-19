import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
} from "discord.js";
import { createTicket } from "../utils/tickets.js";
import type { TicketCategory } from "../utils/ticketStore.js";

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
    await selectInteraction.deferUpdate();
    const category = selectInteraction.values[0] as TicketCategory;

    const result = await createTicket(
      interaction.guild!,
      interaction.user.id,
      interaction.user.username,
      category,
    );

    if (result.success) {
      await selectInteraction.editReply({
        content: `Ticket created: <#${result.channelId}>`,
        components: [],
      });
    } else {
      await selectInteraction.editReply({
        content: result.reason,
        components: [],
      });
    }
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      interaction.editReply({ content: "Ticket creation timed out.", components: [] }).catch(() => {});
    }
  });
}
