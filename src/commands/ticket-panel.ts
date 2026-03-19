import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { addPanel } from "../utils/ticketStore.js";

export const data = new SlashCommandBuilder()
  .setName("ticket-panel")
  .setDescription("Post a ticket reaction panel in this channel (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({ content: "This command must be used in a server channel.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const embed = new EmbedBuilder()
    .setTitle("🎫 Support Tickets")
    .setDescription("React below to open a support ticket:")
    .addFields(
      { name: "🐛 Bug Report", value: "Report a bug or issue", inline: true },
      { name: "💡 Suggestion", value: "Suggest a feature or improvement", inline: true },
      { name: "🛡️ Moderation", value: "Report a moderation concern", inline: true },
    )
    .setColor(0x5865f2)
    .setFooter({ text: "ahousedividedgame.com" });

  const panelMsg = await (interaction.channel as TextChannel).send({ embeds: [embed] });

  await panelMsg.react("🐛");
  await panelMsg.react("💡");
  await panelMsg.react("🛡️");

  addPanel(interaction.guild.id, panelMsg.id, interaction.channel.id);

  await interaction.editReply({ content: "Ticket panel posted!" });
}
