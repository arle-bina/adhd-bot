import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  TextChannel,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type AutocompleteInteraction,
} from "discord.js";
import {
  getTicketByChannel,
  getTicketByNumber,
  getTickets,
} from "../utils/ticketStore.js";
import { mergeTickets, TICKET_MERGE_MODAL_PREFIX } from "../utils/tickets.js";

export const data = new SlashCommandBuilder()
  .setName("merge-ticket")
  .setDescription("Merge another ticket into this ticket channel (staff only)")
  .addIntegerOption((opt) =>
    opt
      .setName("ticket")
      .setDescription("The ticket number to merge into this channel (e.g. 42)")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function autocomplete(interaction: AutocompleteInteraction) {
  if (!interaction.guild) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused();
  const allTickets = Object.values(getTickets(interaction.guild.id));
  // Exclude tickets whose channel is the current one (can't merge into self)
  const currentChannelId = interaction.channelId;

  const choices = allTickets
    .filter((t) => t.channelId !== currentChannelId)
    .map((t) => ({
      number: t.ticketNumber,
      label: `#${String(t.ticketNumber).padStart(4, "0")} — ${t.category} — <@${t.userId}>${t.subject ? ` — ${t.subject}` : ""}`,
    }))
    .filter((t) => {
      const q = focused.toString().toLowerCase();
      return t.number.toString().includes(q) || t.label.toLowerCase().includes(q);
    })
    .slice(0, 25);

  await interaction.respond(
    choices.map((t) => ({ name: t.label.slice(0, 100), value: t.number })),
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({ content: "This command must be used in a server channel.", ephemeral: true });
    return;
  }

  if (interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "This command can only be used in a text channel.", ephemeral: true });
    return;
  }

  const targetChannel = interaction.channel as TextChannel;

  // Verify the current channel is a ticket (the merge destination)
  const targetTicket = getTicketByChannel(interaction.guild.id, targetChannel.id);
  if (!targetTicket) {
    await interaction.reply({
      content: "This channel is not a ticket. Run `/merge-ticket` in the ticket you want to merge *into*.",
      ephemeral: true,
    });
    return;
  }

  const ticketNumber = interaction.options.getInteger("ticket", true);

  // Find the source ticket by number
  const sourceTicket = getTicketByNumber(interaction.guild.id, ticketNumber);
  if (!sourceTicket) {
    await interaction.reply({
      content: `Ticket #${String(ticketNumber).padStart(4, "0")} not found. Make sure the ticket number is correct.`,
      ephemeral: true,
    });
    return;
  }

  // Can't merge a ticket into itself
  if (sourceTicket.channelId === targetChannel.id) {
    await interaction.reply({
      content: "You can't merge a ticket into itself. Run `/merge-ticket` in the ticket you want to merge *into*.",
      ephemeral: true,
    });
    return;
  }

  // Verify the source channel still exists
  const sourceChannel = interaction.guild.channels.cache.get(sourceTicket.channelId) as TextChannel | undefined;
  if (!sourceChannel) {
    await interaction.reply({
      content: `Ticket #${String(ticketNumber).padStart(4, "0")}'s channel no longer exists (may have been deleted).`,
      ephemeral: true,
    });
    return;
  }

  // Show reason modal
  const modal = new ModalBuilder()
    .setCustomId(`${TICKET_MERGE_MODAL_PREFIX}${sourceTicket.channelId}:${targetChannel.id}`)
    .setTitle(`Merge Ticket #${String(ticketNumber).padStart(4, "0")}`);

  const reasonInput = new TextInputBuilder()
    .setCustomId("merge_reason")
    .setLabel("Why are you merging this ticket?")
    .setPlaceholder("e.g. Duplicate bug report, same issue as this ticket")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(500)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
  );

  await interaction.showModal(modal);
}