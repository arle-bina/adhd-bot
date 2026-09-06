import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { getTicketByChannel } from "../utils/ticketStore.js";
import { formatTicketPlatform } from "../utils/ticketPlatform.js";
import { fetchAllMessages } from "../utils/tickets.js";
import type { TicketCategory } from "../utils/ticketStore.js";

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug: "🐛 Bug Report",
  suggestion: "💡 Suggestion",
  moderation: "🛡️ Moderation Issue",
  mechanics: "🧩 Mechanics Help",
};

export const data = new SlashCommandBuilder()
  .setName("copy-ticket")
  .setDescription("Get a text copy of this ticket and its conversation sent to your DMs");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({ content: "This command must be used in a server channel.", ephemeral: true });
    return;
  }

  if (interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "This command can only be used in a text channel.", ephemeral: true });
    return;
  }

  const channel = interaction.channel as TextChannel;
  const ticket = getTicketByChannel(interaction.guild.id, channel.id);

  if (!ticket) {
    await interaction.reply({ content: "This channel is not a ticket.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const messages = await fetchAllMessages(channel, 500);
    const paddedNum = String(ticket.ticketNumber).padStart(4, "0");

    // Build the transcript text
    const lines: string[] = [
      `Ticket #${paddedNum} — ${CATEGORY_LABELS[ticket.category] ?? ticket.category}`,
      `Opened by: ${ticket.userId}`,
      `Created: ${ticket.createdAt}`,
      `Copied by: ${interaction.user.id}`,
      `Copied at: ${new Date().toISOString()}`,
    ];
    if (ticket.platform) lines.push(`Platform: ${formatTicketPlatform(ticket.platform)}`);
    if (ticket.subject) lines.push(`Subject: ${ticket.subject}`);
    if (ticket.description) lines.push(`Description: ${ticket.description}`);
    lines.push(`Messages: ${messages.length}`);
    lines.push("---");

    for (const msg of messages) {
      const ts = msg.createdAt.toISOString().slice(0, 19).replace("T", " ");
      const author = `${msg.author.displayName} (${msg.author.id})`;
      const content = msg.content || "[embed/attachment/sticker]";
      lines.push(`[${ts}] ${author}: ${content}`);
    }

    const transcript = lines.join("\n");
    const buffer = Buffer.from(transcript, "utf-8");

    // Build a summary embed for the DM header
    const dmEmbed = new EmbedBuilder()
      .setTitle(`📋 Ticket #${paddedNum} — Copy`)
      .setColor(0x5865f2)
      .setDescription("Here's a copy of the ticket and its conversation.")
      .addFields(
        { name: "Category", value: CATEGORY_LABELS[ticket.category] ?? ticket.category, inline: true },
        { name: "Created", value: `<t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:R>`, inline: true },
        { name: "Messages", value: String(messages.length), inline: true },
      )
      .setFooter({ text: "ahousedividedgame.com" })
      .setTimestamp();

    if (ticket.subject) {
      dmEmbed.addFields({ name: "Subject", value: ticket.subject });
    }

    await interaction.user.send({
      embeds: [dmEmbed],
      files: [{ attachment: buffer, name: `ticket-${paddedNum}.txt` }],
    });

    await interaction.editReply({ content: "📬 Ticket copy sent to your DMs!" });
  } catch (error) {
    const err = error as { code?: number };
    if (err.code === 50007) {
      await interaction.editReply({
        content: "I couldn't DM you. Please enable DMs from server members and try again.",
      });
    } else {
      console.error("Copy-ticket error:", error);
      await interaction.editReply({ content: "Something went wrong while copying the ticket." });
    }
  }
}
