import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  GuildMember,
  ChannelType,
} from "discord.js";
import { handleClaimTicket } from "../utils/tickets.js";

export const data = new SlashCommandBuilder()
  .setName("claim")
  .setDescription("Claim this ticket to signal you are actively working on it");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({ content: "This command must be used in a server channel.", ephemeral: true });
    return;
  }

  if (interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "This command can only be used in a text channel.", ephemeral: true });
    return;
  }

  const member = interaction.member as GuildMember;
  await handleClaimTicket(interaction.channel as TextChannel, member, interaction);
}
