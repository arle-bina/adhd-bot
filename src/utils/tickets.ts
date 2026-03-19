import {
  Guild,
  GuildMember,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  TextChannel,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type MessageReaction,
  type User,
} from "discord.js";
import {
  type TicketCategory,
  addTicket,
  removeTicket,
  getTicketByChannel,
  findOpenTicket,
  getNextTicketNumber,
  getCategoryId,
  setCategoryId,
  isPanel,
} from "./ticketStore.js";

const CATEGORY_CONFIG: Record<TicketCategory, { label: string; emoji: string; color: number }> = {
  bug: { label: "Bug Report", emoji: "🐛", color: 0xed4245 },
  suggestion: { label: "Suggestion", emoji: "💡", color: 0x57f287 },
  moderation: { label: "Moderation Issue", emoji: "🛡️", color: 0xfee75c },
};

export const PANEL_EMOJI_MAP: Record<string, TicketCategory> = {
  "🐛": "bug",
  "💡": "suggestion",
  "🛡️": "moderation",
};

// In-memory lock to prevent race conditions on double-click
const creationLocks = new Set<string>();

function sanitizeUsername(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 15);
}

async function getOrCreateCategory(guild: Guild): Promise<string> {
  const storedId = getCategoryId(guild.id);
  if (storedId) {
    const existing = guild.channels.cache.get(storedId);
    if (existing) return storedId;
  }

  // Search for existing "Tickets" category
  const found = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === "Tickets",
  );
  if (found) {
    setCategoryId(guild.id, found.id);
    return found.id;
  }

  // Create new category
  const created = await guild.channels.create({
    name: "Tickets",
    type: ChannelType.GuildCategory,
    reason: "AHD Bot — ticket system category",
  });
  setCategoryId(guild.id, created.id);
  return created.id;
}

export interface TicketDetails {
  subject: string;
  description?: string;
}

export async function createTicket(
  guild: Guild,
  userId: string,
  username: string,
  category: TicketCategory,
  details?: TicketDetails,
): Promise<{ success: true; channelId: string } | { success: false; reason: string; existingChannelId?: string }> {
  const lockKey = `${guild.id}:${userId}:${category}`;
  if (creationLocks.has(lockKey)) {
    return { success: false, reason: "Your ticket is already being created. Please wait." };
  }

  creationLocks.add(lockKey);
  try {
    // Check bot permissions
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return { success: false, reason: "I need the **Manage Channels** permission to create tickets." };
    }

    // One-per-category check (with stale cleanup)
    const existing = findOpenTicket(guild.id, userId, category);
    if (existing) {
      const channelStillExists = guild.channels.cache.has(existing.channelId);
      if (channelStillExists) {
        return {
          success: false,
          reason: `You already have an open ${category} ticket: <#${existing.channelId}>`,
          existingChannelId: existing.channelId,
        };
      }
      // Stale — clean up
      removeTicket(guild.id, existing.channelId);
    }

    const categoryId = await getOrCreateCategory(guild);
    const ticketNumber = getNextTicketNumber(guild.id);
    const paddedNum = String(ticketNumber).padStart(4, "0");
    const channelName = `ticket-${category}-${sanitizeUsername(username)}-${paddedNum}`;

    const devTeamRoleId = process.env.DEV_TEAM_ROLE_ID ?? "1470571508689535188";

    const permissionOverwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: userId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: guild.members.me!.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
        ],
      },
      ...(devTeamRoleId
        ? [
            {
              id: devTeamRoleId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ]
        : []),
    ];

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites,
      reason: `AHD Bot — ticket #${paddedNum} (${category})`,
    });

    const config = CATEGORY_CONFIG[category];

    const embed = new EmbedBuilder()
      .setTitle(`${config.emoji} ${config.label} — #${paddedNum}`)
      .setColor(config.color)
      .addFields(
        { name: "Opened by", value: `<@${userId}>`, inline: true },
        { name: "Category", value: config.label, inline: true },
        { name: "Created", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      );

    if (details?.subject) {
      embed.addFields({ name: "Subject", value: details.subject });
    }
    if (details?.description) {
      embed.setDescription(details.description.slice(0, 4096));
    }

    embed.setFooter({ text: "ahousedividedgame.com" }).setTimestamp();

    const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Close Ticket")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒"),
    );

    await channel.send({ embeds: [embed], components: [closeRow] });

    if (devTeamRoleId) {
      await channel.send(`<@&${devTeamRoleId}>`).catch(() => {});
    }

    addTicket(guild.id, {
      userId,
      category,
      channelId: channel.id,
      createdAt: new Date().toISOString(),
      ticketNumber,
    });

    return { success: true, channelId: channel.id };
  } finally {
    creationLocks.delete(lockKey);
  }
}

async function fetchAllMessages(channel: TextChannel, cap: number): Promise<Message[]> {
  const all: Message[] = [];
  let lastId: string | undefined;

  while (all.length < cap) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(lastId ? { before: lastId } : {}),
    });
    if (batch.size === 0) break;
    all.push(...batch.values());
    lastId = batch.last()!.id;
    if (batch.size < 100) break;
  }

  return all.slice(0, cap).reverse(); // chronological order
}

function buildTranscriptText(
  ticket: { ticketNumber: number; category: TicketCategory; userId: string; createdAt: string },
  closerId: string,
  messages: Message[],
): string {
  const config = CATEGORY_CONFIG[ticket.category];
  const lines: string[] = [
    `Ticket #${String(ticket.ticketNumber).padStart(4, "0")} — ${config.label}`,
    `Opened by: ${ticket.userId}`,
    `Closed by: ${closerId}`,
    `Created: ${ticket.createdAt}`,
    `Closed: ${new Date().toISOString()}`,
    `Messages: ${messages.length}`,
    "---",
  ];

  for (const msg of messages) {
    const ts = msg.createdAt.toISOString().slice(0, 19).replace("T", " ");
    const author = `${msg.author.displayName} (${msg.author.id})`;
    const content = msg.content || "[embed/attachment]";
    lines.push(`[${ts}] ${author}: ${content}`);
  }

  return lines.join("\n");
}

export async function closeTicket(
  channel: TextChannel,
  closer: GuildMember,
  interaction?: ButtonInteraction | ChatInputCommandInteraction,
): Promise<void> {
  const guild = channel.guild;
  const ticket = getTicketByChannel(guild.id, channel.id);

  if (!ticket) {
    const msg = "This channel is not a ticket.";
    if (interaction) {
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content: msg, ephemeral: true });
      else await interaction.reply({ content: msg, ephemeral: true });
    } else {
      await channel.send(msg).catch(() => {});
    }
    return;
  }

  // Permission check
  const isCreator = closer.id === ticket.userId;
  const isMod = closer.permissions.has(PermissionFlagsBits.ManageChannels);
  if (!isCreator && !isMod) {
    const msg = "You don't have permission to close this ticket.";
    if (interaction) {
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content: msg, ephemeral: true });
      else await interaction.reply({ content: msg, ephemeral: true });
    } else {
      await channel.send(msg).catch(() => {});
    }
    return;
  }

  // Confirmation
  const confirmEmbed = new EmbedBuilder()
    .setTitle("Close Ticket?")
    .setDescription("Are you sure you want to close this ticket? A transcript will be saved.")
    .setColor(0xed4245);

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close_confirm")
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("ticket_close_cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  let confirmMsg: Message;
  if (interaction) {
    if (interaction.replied || interaction.deferred) {
      confirmMsg = await interaction.followUp({ embeds: [confirmEmbed], components: [confirmRow] }) as Message;
    } else {
      await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow] });
      confirmMsg = await interaction.fetchReply() as Message;
    }
  } else {
    confirmMsg = await channel.send({ embeds: [confirmEmbed], components: [confirmRow] });
  }

  const collector = confirmMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (btn) => btn.user.id === closer.id,
    time: 30_000,
    max: 1,
  });

  collector.on("collect", async (btn) => {
    if (btn.customId === "ticket_close_cancel") {
      const cancelledEmbed = new EmbedBuilder()
        .setTitle("Close Ticket?")
        .setDescription("Close cancelled.")
        .setColor(0x5865f2);
      await btn.update({ embeds: [cancelledEmbed], components: [] });
      return;
    }

    // ticket_close_confirm
    const closingEmbed = new EmbedBuilder()
      .setTitle("Close Ticket?")
      .setDescription("Closing ticket...")
      .setColor(0x95a5a6);
    await btn.update({ embeds: [closingEmbed], components: [] });

    const messages = await fetchAllMessages(channel, 500);
    const transcript = buildTranscriptText(ticket, closer.id, messages);
    const truncated = messages.length >= 500;

    const config = CATEGORY_CONFIG[ticket.category];
    const paddedNum = String(ticket.ticketNumber).padStart(4, "0");
    const created = new Date(ticket.createdAt);
    const duration = Math.floor((Date.now() - created.getTime()) / 60000);
    const durationStr = duration < 60 ? `${duration}m` : `${Math.floor(duration / 60)}h ${duration % 60}m`;

    const logEmbed = new EmbedBuilder()
      .setTitle(`🎫 Ticket Closed — #${paddedNum}`)
      .setColor(0x95a5a6)
      .addFields(
        { name: "Type", value: `${config.emoji} ${config.label}`, inline: true },
        { name: "Opened by", value: `<@${ticket.userId}>`, inline: true },
        { name: "Closed by", value: `<@${closer.id}>`, inline: true },
        { name: "Duration", value: durationStr, inline: true },
        { name: "Messages", value: String(messages.length), inline: true },
      )
      .setFooter({ text: truncated ? "Transcript truncated at 500 messages · ahousedividedgame.com" : "ahousedividedgame.com" })
      .setTimestamp();

    const logChannelId = process.env.TICKET_LOG_CHANNEL_ID ?? "1483974417628270593";
    if (logChannelId) {
      const logChannel = guild.channels.cache.get(logChannelId) as TextChannel | undefined;
      if (logChannel) {
        const buffer = Buffer.from(transcript, "utf-8");
        await logChannel.send({
          embeds: [logEmbed],
          files: [{ attachment: buffer, name: `ticket-${paddedNum}.txt` }],
        }).catch((err) => console.error("Failed to post transcript:", err));
      }
    }

    removeTicket(guild.id, channel.id);
    await channel.delete(`Ticket #${paddedNum} closed by ${closer.user.tag}`).catch(() => {});
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      const timedOutEmbed = new EmbedBuilder()
        .setTitle("Close Ticket?")
        .setDescription("Close timed out.")
        .setColor(0x5865f2);
      confirmMsg.edit({ embeds: [timedOutEmbed], components: [] }).catch(() => {});
    }
  });
}

export async function handlePanelReaction(
  reaction: MessageReaction,
  user: User,
  guild: Guild,
): Promise<void> {
  if (!isPanel(guild.id, reaction.message.id)) return;

  // Remove user's reaction to keep panel clean
  await reaction.users.remove(user.id).catch(() => {});

  const emojiName = reaction.emoji.name;
  if (!emojiName || !(emojiName in PANEL_EMOJI_MAP)) return;
  const category = PANEL_EMOJI_MAP[emojiName];

  const result = await createTicket(guild, user.id, user.username, category);

  // Notify via DM (reactions can't reply ephemerally)
  try {
    if (result.success) {
      await user.send(`Your ${category} ticket has been created: <#${result.channelId}>`);
    } else {
      await user.send(result.reason);
    }
  } catch {
    // DMs disabled — ticket channel itself is the notification
  }
}

export async function handleLockReaction(
  reaction: MessageReaction,
  user: User,
  guild: Guild,
): Promise<void> {
  if (reaction.emoji.name !== "🔒") return;

  const ticket = getTicketByChannel(guild.id, reaction.message.channel.id);
  if (!ticket) return;

  const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id);
  if (!member) return;

  await closeTicket(reaction.message.channel as TextChannel, member);
}
