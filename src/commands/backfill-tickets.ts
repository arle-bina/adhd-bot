import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  type Message,
  type Attachment,
} from "discord.js";
import { getTickets, addTicket, type Ticket } from "../utils/ticketStore.js";
import { fetchAllMessages, toGameCategory } from "../utils/tickets.js";
import { createTicket as apiCreateTicket } from "../utils/ticketsApi.js";

// How many of the earliest channel messages to scan for the opening report.
const HISTORY_SCAN_CAP = 50;
// Small delay between per-ticket Discord history fetches to stay friendly with rate limits.
const PER_TICKET_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Treats an attachment as an image if its content-type or filename/url looks like one. */
function isImageAttachment(att: Attachment): boolean {
  if (att.contentType?.startsWith("image/")) return true;
  const name = att.name ?? att.url;
  return /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(name);
}

/** A message that is just a role/user ping (e.g. the dev-team alert) carries no report. */
function isPingOnly(content: string): boolean {
  return /^(?:<@[&!]?\d+>\s*)+$/.test(content.trim());
}

interface OpeningContext {
  title: string;
  description: string;
  imageUrls: string[];
}

/**
 * Derive title/description/images from the opening of a ticket channel.
 *
 * We fetch the earliest messages, skip the bot's own panel/embed messages and any
 * role-ping-only messages, then take the first meaningful message from the opener
 * (falling back to the first meaningful human message) as the user's report. The
 * description is that message's text; the title is the stored subject if present,
 * otherwise the first line of the report, truncated. Image attachments on the
 * opening message are collected. When the channel/history yields nothing usable we
 * fall back to whatever the ticketStore record holds.
 */
async function deriveOpeningContext(
  channel: TextChannel | undefined,
  ticket: Ticket,
): Promise<OpeningContext | undefined> {
  let report: { content: string; images: string[] } | undefined;

  if (channel) {
    try {
      const messages = await fetchAllMessages(channel, HISTORY_SCAN_CAP);
      const meaningful = (msg: Message): boolean => {
        if (msg.author.bot) return false; // skip the bot's panel embeds & system pings
        const hasText = Boolean(msg.content.trim()) && !isPingOnly(msg.content);
        return hasText || msg.attachments.size > 0;
      };
      // Prefer the opener's earliest meaningful message; else the first human one.
      const fromOpener = messages.find((m) => m.author.id === ticket.userId && meaningful(m));
      const opening = fromOpener ?? messages.find(meaningful);
      if (opening) {
        const images = [...opening.attachments.values()].filter(isImageAttachment).map((a) => a.url);
        report = { content: opening.content.trim(), images };
      }
    } catch (err) {
      console.warn(`[backfill-tickets] could not read history for #${ticket.ticketNumber}:`, err);
    }
  }

  // Fall back to the stored record when the channel/message is gone.
  const storedDescription = ticket.description?.trim() || ticket.subject?.trim();
  const description = (report?.content || storedDescription || "").slice(0, 5000);
  const imageUrls = report?.images ?? [];

  // Nothing to import at all.
  if (!description && imageUrls.length === 0) return undefined;

  const subject = ticket.subject?.trim();
  const firstLine = description.split("\n")[0]?.trim() ?? "";
  const titleSource = subject || firstLine || `${ticket.category} ticket #${ticket.ticketNumber}`;
  const title = titleSource.slice(0, 200);

  return {
    title,
    description: description || title,
    imageUrls,
  };
}

export const data = new SlashCommandBuilder()
  .setName("backfill-tickets")
  .setDescription("Import existing open tickets into the game backend, preserving their numbers (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addBooleanOption((opt) =>
    opt
      .setName("resync")
      .setDescription("Also re-send open tickets that were already synced (default: only un-synced)")
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: "This command must be used in a server.", ephemeral: true });
    return;
  }

  const resync = interaction.options.getBoolean("resync") ?? false;

  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  // Every record in the ticketStore is an open ticket — closing removes it.
  const openTickets = Object.values(getTickets(guild.id));

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let considered = 0;

  for (const ticket of openTickets) {
    // Already mirrored and not asked to re-sync → skip.
    if (ticket.apiTicketNumber != null && !resync) {
      skipped++;
      continue;
    }
    considered++;

    try {
      const channel = guild.channels.cache.get(ticket.channelId) as TextChannel | undefined;
      const textChannel =
        channel && channel.type === ChannelType.GuildText ? channel : undefined;

      const context = await deriveOpeningContext(textChannel, ticket);
      if (!context) {
        // Nothing usable in channel or record — skip rather than push an empty ticket.
        skipped++;
        await sleep(PER_TICKET_DELAY_MS);
        continue;
      }

      const opener = guild.members.cache.get(ticket.userId);
      const username = opener?.user.username;
      const displayName = opener?.displayName ?? username;

      const res = await apiCreateTicket({
        category: toGameCategory(ticket.category),
        title: context.title,
        description: context.description,
        discordChannelId: ticket.channelId,
        discordUserId: ticket.userId,
        discordUsername: username,
        discordDisplayName: displayName,
        imageUrls: context.imageUrls,
        ticketNumber: ticket.ticketNumber,
        createdAt: ticket.createdAt,
        status: "open",
      });

      if (res?.ticketNumber != null) {
        // Persist the backend number so subsequent runs skip this ticket.
        addTicket(guild.id, { ...ticket, apiTicketNumber: res.ticketNumber });
        created++;
      } else {
        // createTicket swallows errors (or API not configured) and returns undefined.
        failed++;
      }
    } catch (err) {
      console.error(`[backfill-tickets] failed for #${ticket.ticketNumber}:`, err);
      failed++;
    }

    // Be gentle with Discord history fetches between tickets.
    await sleep(PER_TICKET_DELAY_MS);
  }

  const summary =
    `Backfill complete (${resync ? "re-sync all open" : "un-synced only"}).\n` +
    `**${created}** imported · **${skipped}** skipped · **${failed}** failed — ` +
    `out of ${openTickets.length} open ticket(s) (${considered} considered).`;

  await interaction.editReply({ content: summary });
}
