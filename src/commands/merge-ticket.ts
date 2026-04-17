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
} from "discord.js";
import {
  getTicketByChannel,
  findOpenTicketsByUser,
} from "../utils/ticketStore.js";
import { mergeTickets, TICKET_MERGE_MODAL_PREFIX } from "../utils/tickets.js";

export const data = new SlashCommandBuilder()
  .setName("merge-ticket")
  .setDescription("Merge another user's ticket into this ticket channel")
  .addUserOption((opt) =>
    opt
      .setName("user")
      .setDescription("The user whose open ticket you want to merge into this one")
      .setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

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
    await interaction.reply({ content: "This channel is not a ticket. Run `/merge-ticket` in the ticket you want to merge *into*.", ephemeral: true });
    return;
  }

  const sourceUser = interaction.options.getUser("user", true);

  // Find the source user's tickets
  const sourceTickets = findOpenTicketsByUser(interaction.guild.id, sourceUser.id);
  const activeSourceTickets = sourceTickets.filter((t) => interaction.guild!.channels.cache.has(t.channelId));

  if (activeSourceTickets.length === 0) {
    await interaction.reply({ content: `<@${sourceUser.id}> has no open tickets.`, ephemeral: true });
    return;
  }

  // Filter out the target ticket (can't merge a ticket into itself)
  const mergeableTickets = activeSourceTickets.filter((t) => t.channelId !== targetChannel.id);
  if (mergeableTickets.length === 0) {
    await interaction.reply({ content: `<@${sourceUser.id}> only has this ticket open — nothing to merge.`, ephemeral: true });
    return;
  }

  // If they have exactly one mergeable ticket, proceed with modal
  // If multiple, we still proceed — we'll pick the first one (most likely scenario: user has 1 ticket to merge)
  // For robustness with the 3-ticket limit, we show a modal asking for reason
  const sourceTicket = mergeableTickets[0];
  const sourceChannel = interaction.guild.channels.cache.get(sourceTicket.channelId) as TextChannel | undefined;

  if (!sourceChannel) {
    await interaction.reply({ content: "The source ticket channel no longer exists.", ephemeral: true });
    return;
  }

  // Show reason modal
  const modal = new ModalBuilder()
    .setCustomId(`${TICKET_MERGE_MODAL_PREFIX}${sourceTicket.channelId}:${targetChannel.id}`)
    .setTitle("Merge Ticket — Reason");

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