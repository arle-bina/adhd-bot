import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
  ChannelType,
} from "discord.js";
import { getTickets } from "../utils/ticketStore.js";

const TICKET_VIEWER_ROLE_ID = "1483975767703552111";

export const data = new SlashCommandBuilder()
  .setName("sync-ticket-perms")
  .setDescription("Sync permissions for all existing ticket channels (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: "This command must be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const tickets = getTickets(interaction.guild.id);
    const ticketChannels = Object.values(tickets).map((t) => t.channelId);

    let updated = 0;
    let notFound = 0;
    let failed = 0;

    for (const channelId of ticketChannels) {
      const channel = interaction.guild.channels.cache.get(channelId) as TextChannel | undefined;
      if (!channel || channel.type !== ChannelType.GuildText) {
        notFound++;
        continue;
      }

      try {
        await channel.permissionOverwrites.edit(TICKET_VIEWER_ROLE_ID, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
        updated++;
      } catch {
        failed++;
      }
    }

    await interaction.editReply({
      content: `Synced ticket permissions. **${updated}** updated · **${notFound}** not found (closed) · **${failed}** failed — out of ${ticketChannels.length} tickets.`,
    });
  } catch (error) {
    console.error("sync-ticket-perms error:", error);
    await interaction.editReply({ content: "Failed to sync ticket permissions. Check bot permissions." });
  }
}
