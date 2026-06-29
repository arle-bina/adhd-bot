import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { updateTicket as apiUpdateTicket } from "../utils/ticketsApi.js";

export const data = new SlashCommandBuilder()
  .setName("retriage")
  .setDescription("Force the ops triage worker to re-assess a ticket (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addIntegerOption((opt) =>
    opt
      .setName("ticket")
      .setDescription("The ticket number to re-triage")
      .setMinValue(1)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const ticketNumber = interaction.options.getInteger("ticket", true);

  await interaction.deferReply({ ephemeral: true });

  // Non-fatal: updateTicket swallows errors (and a missing game-API config) and
  // returns undefined, so an undefined result means the request did not land.
  const res = await apiUpdateTicket({ ticketNumber, action: "retriage" });

  if (res) {
    await interaction.editReply({ content: `Ticket #${ticketNumber} queued for re-triage.` });
  } else {
    await interaction.editReply({
      content: `Failed to queue ticket #${ticketNumber} for re-triage. Check the logs (the game API may be down or unconfigured).`,
    });
  }
}
