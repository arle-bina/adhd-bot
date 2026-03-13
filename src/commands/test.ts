import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("test")
  .setDescription("Test command to verify bot deployment");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    content: `Bot is running! Deployed at: ${new Date().toISOString()}`,
    ephemeral: true,
  });
}
