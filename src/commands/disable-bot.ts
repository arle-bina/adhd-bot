import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { setBotEnabled } from "../utils/botState.js";

export const data = new SlashCommandBuilder()
  .setName("disable-bot")
  .setDescription("Disable the bot for non-admin users")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  setBotEnabled(false);
  await interaction.reply({ content: "Bot is now **disabled** for non-admin users.", ephemeral: true });
}
