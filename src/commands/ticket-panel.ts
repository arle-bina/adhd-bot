import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ticket-panel")
  .setDescription("Post a ticket panel in this channel (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({ content: "This command must be used in a server channel.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const embed = new EmbedBuilder()
    .setTitle("🎫 Support Tickets")
    .setDescription("Click a button below to open a support ticket:")
    .addFields(
      { name: "🐛 Bug Report", value: "Report a bug or issue", inline: true },
      { name: "💡 Suggestion", value: "Suggest a feature or improvement", inline: true },
      { name: "🛡️ Moderation", value: "Report a moderation concern", inline: true },
    )
    .setColor(0x5865f2)
    .setFooter({ text: "ahousedividedgame.com" });

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_panel_bug")
      .setLabel("Bug Report")
      .setEmoji("🐛")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("ticket_panel_suggestion")
      .setLabel("Suggestion")
      .setEmoji("💡")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ticket_panel_moderation")
      .setLabel("Moderation")
      .setEmoji("🛡️")
      .setStyle(ButtonStyle.Primary),
  );

  await (interaction.channel as TextChannel).send({ embeds: [embed], components: [buttonRow] });

  await interaction.editReply({ content: "Ticket panel posted!" });
}
