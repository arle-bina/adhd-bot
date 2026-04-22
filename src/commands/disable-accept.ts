import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { setAcceptEnabled } from "../utils/botState.js";

export const data = new SlashCommandBuilder()
  .setName("disable-accept")
  .setDescription("Disable the /accept command for non-admin users")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  setAcceptEnabled(false);
  await interaction.reply({ content: "`/accept` is now **disabled** for non-admin users.", ephemeral: true });
}
