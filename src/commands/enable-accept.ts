import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { setAcceptEnabled } from "../utils/botState.js";

export const data = new SlashCommandBuilder()
  .setName("enable-accept")
  .setDescription("Re-enable the /accept command for non-admin users")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  setAcceptEnabled(true);
  await interaction.reply({ content: "`/accept` is now **enabled** for all users.", ephemeral: true });
}
