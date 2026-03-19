import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  GuildMember,
  ChannelType,
} from "discord.js";
import { closeTicket } from "../utils/tickets.js";

export const data = new SlashCommandBuilder()
  .setName("close-ticket")
  .setDescription("Close the current ticket channel");

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
  await closeTicket(interaction.channel as TextChannel, member, interaction);
}
