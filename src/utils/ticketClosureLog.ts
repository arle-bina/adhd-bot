import { ChannelType, EmbedBuilder, type Guild } from "discord.js";
import type { TicketCategory } from "./ticketStore.js";

const CATEGORY_CONFIG: Record<TicketCategory, { label: string; emoji: string }> = {
  bug: { label: "Bug Report", emoji: "🐛" },
  suggestion: { label: "Suggestion", emoji: "💡" },
  moderation: { label: "Moderation Issue", emoji: "🛡️" },
  mechanics: { label: "Mechanics Question", emoji: "⚙️" },
};

export interface TicketClosureLogMessage {
  createdAt: Date;
  author: { displayName: string; id: string };
  content?: string;
}

export interface TicketClosureLogInput {
  ticketNumber: number;
  category: TicketCategory;
  userId: string;
  createdAt: string;
  subject?: string;
  description?: string;
  closerId: string;
  resolutionMessage?: string;
  messages: readonly TicketClosureLogMessage[];
}

export function buildTicketClosureLogPayload(input: TicketClosureLogInput) {
  const config = CATEGORY_CONFIG[input.category];
  const paddedNum = String(input.ticketNumber).padStart(4, "0");
  const truncated = input.messages.length >= 500;
  const logFields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Type", value: `${config.emoji} ${config.label}`, inline: true },
    { name: "Opened by", value: `<@${input.userId}>`, inline: true },
    { name: "Closed by", value: `<@${input.closerId}>`, inline: true },
    { name: "Messages", value: String(input.messages.length), inline: true },
  ];

  if (input.subject) {
    logFields.push({
      name: "Subject",
      value: input.subject.length > 1024 ? `${input.subject.slice(0, 1021)}...` : input.subject,
    });
  }
  if (input.description) {
    logFields.push({
      name: "Description",
      value:
        input.description.length > 1024 ? `${input.description.slice(0, 1021)}...` : input.description,
    });
  }
  if (input.resolutionMessage) {
    logFields.push({
      name: "Resolution",
      value:
        input.resolutionMessage.length > 1024
          ? `${input.resolutionMessage.slice(0, 1021)}...`
          : input.resolutionMessage,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket Closed — #${paddedNum}`)
    .setColor(0x95a5a6)
    .addFields(logFields)
    .setFooter({
      text: truncated
        ? "Transcript truncated at 500 messages · ahousedividedgame.com"
        : "ahousedividedgame.com",
    })
    .setTimestamp()
    .toJSON();

  const lines: string[] = [
    `Ticket #${paddedNum} — ${config.label}`,
    `Opened by: ${input.userId}`,
    `Closed by: ${input.closerId}`,
    `Created: ${input.createdAt}`,
    `Closed: ${new Date().toISOString()}`,
  ];
  if (input.subject) lines.push(`Subject: ${input.subject}`);
  if (input.description) lines.push(`Description: ${input.description}`);
  lines.push(`Messages: ${input.messages.length}`);
  if (input.resolutionMessage) {
    lines.push(`Resolution (to opener): ${input.resolutionMessage}`);
  }
  lines.push("---");
  for (const message of input.messages) {
    const timestamp = message.createdAt.toISOString().slice(0, 19).replace("T", " ");
    const author = `${message.author.displayName} (${message.author.id})`;
    lines.push(`[${timestamp}] ${author}: ${message.content || "[embed/attachment]"}`);
  }

  return {
    embed,
    transcript: lines.join("\n"),
    attachmentName: `ticket-${paddedNum}.txt`,
  };
}

/** Post an automated-resolution transcript before the ticket channel is deleted. */
export async function postTicketClosureLog(
  guild: Guild,
  input: TicketClosureLogInput,
): Promise<boolean> {
  const logChannelId = process.env.TICKET_LOG_CHANNEL_ID ?? "1483974417628270593";
  const candidate =
    guild.channels.cache.get(logChannelId) ??
    (await guild.channels.fetch(logChannelId).catch((error) => {
      console.error("Failed to fetch ticket log channel:", error);
      return null;
    }));
  if (!candidate || candidate.type !== ChannelType.GuildText) {
    console.error(`Ticket log channel ${logChannelId} is unavailable or is not a text channel`);
    return false;
  }

  const payload = buildTicketClosureLogPayload(input);
  const existingTitle = payload.embed.title;
  try {
    const recent = await candidate.messages.fetch({ limit: 100 });
    if (recent.some((message) => message.embeds.some((embed) => embed.title === existingTitle))) {
      return true;
    }
  } catch (error) {
    // A history read is only an idempotency guard. The send itself remains the
    // source of truth if Discord cannot return recent log messages.
    console.warn("Could not check recent ticket-log messages before posting:", error);
  }

  try {
    await candidate.send({
      embeds: [payload.embed],
      files: [{ attachment: Buffer.from(payload.transcript, "utf-8"), name: payload.attachmentName }],
    });
    return true;
  } catch (error) {
    console.error("Failed to post automated ticket closure transcript:", error);
    return false;
  }
}
