import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { setBotEnabled } from "../utils/botState.js";

export const data = new SlashCommandBuilder()
  .setName("enable-bot")
  .setDescription("Enable the bot for all users")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  setBotEnabled(true);
  await interaction.reply({ content: "Bot is now **enabled** for all users.", ephemeral: true });
}
