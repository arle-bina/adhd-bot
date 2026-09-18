import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { reassessTicket } from "../utils/opsReassess.js";

// Staff command: re-run the GitHub triage for one game support ticket. The
// dashboard does the work in the background (classification, already-fixed
// check, related issues and PRs) and this replies with the ticket's ops page,
// where the whole assessment is laid out with its confidences.
export const data = new SlashCommandBuilder()
  .setName("reassess")
  .setDescription("Re-run the GitHub triage for a support ticket (Admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addIntegerOption((opt) =>
    opt
      .setName("ticket")
      .setDescription("The game support ticket number, e.g. 1333")
      .setRequired(true)
      .setMinValue(1),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const ticket = interaction.options.getInteger("ticket", true);

  const result = await reassessTicket(ticket, interaction.user.username);
  if (!result.ok) {
    await interaction.editReply({ content: `Reassessment failed for ticket #${ticket} — ${result.reason}` });
    return;
  }

  await interaction.editReply({
    content: `Reassessing ticket #${result.data.ticket} — the page updates in a few seconds:\n${result.data.opsUrl}`,
  });
}
