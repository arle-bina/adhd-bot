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
  ModalBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type MessageReaction,
  type ModalSubmitInteraction,
  type User,
} from "discord.js";
import {
  type TicketCategory,
  addTicket,
  removeTicket,
  getTicketByChannel,
  getTicketByNumber,
  findOpenTicket,
  getNextTicketNumber,
  getCategoryId,
  setCategoryId,
  isPanel,
  countOpenTicketsByUserCategory,
  getTickets,
  MAX_TICKETS_PER_CATEGORY,
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

function devTeamRoleId(): string | undefined {
  const raw = process.env.DEV_TEAM_ROLE_ID?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

/**
 * Who counts as staff for tickets: matches who can access ticket channels (dev role, Manage Channels
 * on this channel or at guild level, Administrator). Guild-level `permissions` alone misses
 * channel-only overwrites and the dev team role — those cases previously skipped the resolution DM.
 */
function memberCanActAsTicketStaff(member: GuildMember, channel: TextChannel): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  const inChannel = channel.permissionsFor(member)?.has(PermissionFlagsBits.ManageChannels) ?? false;
  if (inChannel) return true;
  const devId = devTeamRoleId();
  if (devId && member.roles.cache.has(devId)) return true;
  return false;
}

function canCloseTicket(member: GuildMember, channel: TextChannel, ticketOpenerId: string): boolean {
  if (member.id === ticketOpenerId) return true;
  return memberCanActAsTicketStaff(member, channel);
}

/** Staff closing another member's ticket — resolution required and opener should be DMed. */
function isStaffClosingSomeoneElsesTicket(
  closer: GuildMember,
  channel: TextChannel,
  ticketOpenerId: string,
): boolean {
  return closer.id !== ticketOpenerId && memberCanActAsTicketStaff(closer, channel);
}

export const TICKET_CLOSE_MODAL_PREFIX = "ticket_close_modal_";

function buildTicketCloseModal(channelId: string): ModalBuilder {
  const resolutionInput = new TextInputBuilder()
    .setCustomId("ticket_resolution_message")
    .setLabel("Resolution message for the opener")
    .setPlaceholder(
      "Required when staff closes someone else's ticket. Shown to them via DM when the ticket closes.",
    )
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(false);

  return new ModalBuilder()
    .setCustomId(`${TICKET_CLOSE_MODAL_PREFIX}${channelId}`)
    .setTitle("Close ticket")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(resolutionInput));
}

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

    // Per-category limit (with stale cleanup)
    const openTickets = countOpenTicketsByUserCategory(guild.id, userId, category);
    // Clean up stale tickets (channels that no longer exist)
    let activeCount = 0;
    let firstActiveChannelId: string | undefined;
    const allCategoryTickets = Object.values(getTickets(guild.id)).filter(
      (t) => t.userId === userId && t.category === category,
    );
    for (const t of allCategoryTickets) {
      if (guild.channels.cache.has(t.channelId)) {
        activeCount++;
        if (!firstActiveChannelId) firstActiveChannelId = t.channelId;
      } else {
        // Stale — clean up
        removeTicket(guild.id, t.channelId);
      }
    }

    if (activeCount >= MAX_TICKETS_PER_CATEGORY) {
      return {
        success: false,
        reason: `You already have ${activeCount} open ${category} ticket(s). You can have up to ${MAX_TICKETS_PER_CATEGORY} per category. Close one first: <#${firstActiveChannelId}>`,
        existingChannelId: firstActiveChannelId,
      };
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
      subject: details?.subject,
      description: details?.description,
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
  ticket: { ticketNumber: number; category: TicketCategory; userId: string; createdAt: string; subject?: string; description?: string },
  closerId: string,
  messages: Message[],
  resolutionMessage?: string,
): string {
  const config = CATEGORY_CONFIG[ticket.category];
  const lines: string[] = [
    `Ticket #${String(ticket.ticketNumber).padStart(4, "0")} — ${config.label}`,
    `Opened by: ${ticket.userId}`,
    `Closed by: ${closerId}`,
    `Created: ${ticket.createdAt}`,
    `Closed: ${new Date().toISOString()}`,
  ];
  if (ticket.subject) lines.push(`Subject: ${ticket.subject}`);
  if (ticket.description) lines.push(`Description: ${ticket.description}`);
  lines.push(`Messages: ${messages.length}`);
  if (resolutionMessage) {
    lines.push(`Resolution (to opener): ${resolutionMessage}`);
  }
  lines.push("---");

  for (const msg of messages) {
    const ts = msg.createdAt.toISOString().slice(0, 19).replace("T", " ");
    const author = `${msg.author.displayName} (${msg.author.id})`;
    const content = msg.content || "[embed/attachment]";
    lines.push(`[${ts}] ${author}: ${content}`);
  }

  return lines.join("\n");
}

/** Whether the opener received the resolution DM (only relevant when staff closed for someone else). */
async function finalizeTicketClose(
  channel: TextChannel,
  closer: GuildMember,
  ticket: NonNullable<ReturnType<typeof getTicketByChannel>>,
  resolutionMessage: string,
): Promise<boolean> {
  const guild = channel.guild;
  const messages = await fetchAllMessages(channel, 500);
  const truncated = messages.length >= 500;

  const config = CATEGORY_CONFIG[ticket.category];
  const paddedNum = String(ticket.ticketNumber).padStart(4, "0");
  const created = new Date(ticket.createdAt);
  const duration = Math.floor((Date.now() - created.getTime()) / 60000);
  const durationStr = duration < 60 ? `${duration}m` : `${Math.floor(duration / 60)}h ${duration % 60}m`;

  // Build log embed with original ticket details
  const logFields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Type", value: `${config.emoji} ${config.label}`, inline: true },
    { name: "Opened by", value: `<@${ticket.userId}>`, inline: true },
    { name: "Closed by", value: `<@${closer.id}>`, inline: true },
    { name: "Duration", value: durationStr, inline: true },
    { name: "Messages", value: String(messages.length), inline: true },
  ];

  if (ticket.subject) {
    logFields.push({ name: "Subject", value: ticket.subject.length > 1024 ? `${ticket.subject.slice(0, 1021)}...` : ticket.subject });
  }
  if (ticket.description) {
    const descValue = ticket.description.length > 1024 ? `${ticket.description.slice(0, 1021)}...` : ticket.description;
    logFields.push({ name: "Description", value: descValue });
  }
  if (resolutionMessage) {
    logFields.push({
      name: "Resolution",
      value: resolutionMessage.length > 1024 ? `${resolutionMessage.slice(0, 1021)}...` : resolutionMessage,
    });
  }

  const logEmbed = new EmbedBuilder()
    .setTitle(`🎫 Ticket Closed — #${paddedNum}`)
    .setColor(0x95a5a6)
    .addFields(logFields)
    .setFooter({
      text: truncated ? "Transcript truncated at 500 messages · ahousedividedgame.com" : "ahousedividedgame.com",
    })
    .setTimestamp();

  const transcript = buildTranscriptText(ticket, closer.id, messages, resolutionMessage || undefined);

  const logChannelId = process.env.TICKET_LOG_CHANNEL_ID ?? "1483974417628270593";
  if (logChannelId) {
    const logChannel = guild.channels.cache.get(logChannelId) as TextChannel | undefined;
    if (logChannel) {
      const buffer = Buffer.from(transcript, "utf-8");
      await logChannel
        .send({
          embeds: [logEmbed],
          files: [{ attachment: buffer, name: `ticket-${paddedNum}.txt` }],
        })
        .catch((err) => console.error("Failed to post transcript:", err));
    }
  }

  let resolutionDmDelivered = false;
  if (closer.id !== ticket.userId && resolutionMessage) {
    try {
      const opener = await closer.client.users.fetch(ticket.userId);
      const header = `Your **${config.label}** ticket has been closed by ${closer.user.tag}.\n\n**Resolution**\n`;
      const maxRes = Math.max(0, 4096 - header.length);
      const dmEmbed = new EmbedBuilder()
        .setTitle(`Ticket #${paddedNum} closed`)
        .setColor(0x95a5a6)
        .setDescription(`${header}${resolutionMessage.slice(0, maxRes)}`)
        .setFooter({ text: "ahousedividedgame.com" })
        .setTimestamp();

      if (ticket.subject) {
        dmEmbed.addFields({ name: "Subject", value: ticket.subject });
      }

      await opener.send({ embeds: [dmEmbed] });
      resolutionDmDelivered = true;
    } catch (err) {
      console.warn("Ticket resolution DM failed:", err);
    }
  }

  removeTicket(guild.id, channel.id);
  await channel.delete(`Ticket #${paddedNum} closed by ${closer.user.tag}`).catch(() => {});
  return resolutionDmDelivered;
}

export async function handleTicketCloseModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild || !interaction.channelId) {
    await interaction.reply({ content: "This can only be used inside a server ticket channel.", ephemeral: true });
    return;
  }

  const channelId = interaction.customId.slice(TICKET_CLOSE_MODAL_PREFIX.length);
  if (channelId !== interaction.channelId) {
    await interaction.reply({ content: "This form does not match the current channel.", ephemeral: true });
    return;
  }

  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "Ticket channel not found.", ephemeral: true });
    return;
  }
  const textChannel = channel as TextChannel;

  const closer =
    interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);

  const ticket = getTicketByChannel(interaction.guild.id, channelId);
  if (!ticket) {
    await interaction.reply({ content: "This ticket is already closed or is not a ticket channel.", ephemeral: true });
    return;
  }

  if (!canCloseTicket(closer, textChannel, ticket.userId)) {
    await interaction.reply({ content: "You don't have permission to close this ticket.", ephemeral: true });
    return;
  }

  const resolutionRaw = interaction.fields.getTextInputValue("ticket_resolution_message");
  const resolutionMessage = resolutionRaw.trim();
  const staffClosingOther = isStaffClosingSomeoneElsesTicket(closer, textChannel, ticket.userId);
  if (staffClosingOther && !resolutionMessage) {
    await interaction.reply({
      content: "Staff must enter a resolution message so the ticket opener can be notified.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const dmDelivered = await finalizeTicketClose(textChannel, closer, ticket, resolutionMessage);
    let reply = "Ticket closed.";
    if (staffClosingOther && resolutionMessage) {
      reply += dmDelivered
        ? " The opener was sent your resolution via DM."
        : " The opener could not be DMed (they may have DMs disabled).";
    }
    await interaction.editReply({ content: reply });
  } catch (err) {
    console.error("Ticket close finalize error:", err);
    await interaction.editReply({ content: "Something went wrong while closing the ticket. Check the logs." });
  }
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

  if (!canCloseTicket(closer, channel, ticket.userId)) {
    const msg = "You don't have permission to close this ticket.";
    if (interaction) {
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content: msg, ephemeral: true });
      else await interaction.reply({ content: msg, ephemeral: true });
    } else {
      await channel.send(msg).catch(() => {});
    }
    return;
  }

  // Slash command or Close Ticket button → resolution modal immediately
  if (interaction) {
    await interaction.showModal(buildTicketCloseModal(channel.id));
    return;
  }

  // 🔒 reaction path — confirm in channel, then modal
  const confirmEmbed = new EmbedBuilder()
    .setTitle("Close Ticket?")
    .setDescription("Are you sure you want to close this ticket? A transcript will be saved. You will be asked for a resolution message next.")
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

  const confirmMsg = await channel.send({ embeds: [confirmEmbed], components: [confirmRow] });

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

    await btn.showModal(buildTicketCloseModal(channel.id));
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

// ─── Ticket Merging ─────────────────────────────────────────────────────────

export const TICKET_MERGE_MODAL_PREFIX = "ticket_merge_modal_";

export interface MergeResult {
  success: boolean;
  reason?: string;
}

export async function mergeTickets(
  sourceChannel: TextChannel,
  targetChannel: TextChannel,
  sourceTicket: NonNullable<ReturnType<typeof getTicketByChannel>>,
  targetTicket: NonNullable<ReturnType<typeof getTicketByChannel>>,
  staffMember: GuildMember,
  reason: string,
): Promise<MergeResult> {
  const guild = sourceChannel.guild;
  const sourceConfig = CATEGORY_CONFIG[sourceTicket.category];
  const targetConfig = CATEGORY_CONFIG[targetTicket.category];
  const sourcePadded = String(sourceTicket.ticketNumber).padStart(4, "0");
  const targetPadded = String(targetTicket.ticketNumber).padStart(4, "0");

  try {
    // 1. Grant source user access to target channel
    await targetChannel.permissionOverwrites.edit(sourceTicket.userId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });

    // 2. Copy messages from source to target
    const messages = await fetchAllMessages(sourceChannel, 100);
    const headerEmbed = new EmbedBuilder()
      .setTitle(`📎 Merged from Ticket #${sourcePadded}`)
      .setColor(sourceConfig.color)
      .setDescription(
        `**${sourceConfig.emoji} ${sourceConfig.label} #${sourcePadded}** (opened by <@${sourceTicket.userId}>) has been merged into this ticket.\n**Reason:** ${reason}`,
      )
      .setFooter({ text: `Merged by ${staffMember.user.tag}` })
      .setTimestamp();

    if (sourceTicket.subject) {
      headerEmbed.addFields({ name: "Original Subject", value: sourceTicket.subject });
    }

    await targetChannel.send({ embeds: [headerEmbed] });

    for (const msg of messages) {
      if (msg.author.bot && msg.embeds.length > 0) continue; // skip bot embeds (initial ticket embed, etc.)
      if (!msg.content && msg.embeds.length === 0 && msg.attachments.size === 0) continue;

      const ts = msg.createdAt.toISOString().slice(0, 19).replace("T", " ");
      let content = `**[${ts}] <@${msg.author.id}>:** ${msg.content}`;
      if (content.length > 1900) content = content.slice(0, 1897) + "...";

      await targetChannel.send({ content }).catch(() => {});
    }

    // 3. Notify original opener
    await targetChannel.send(`<@${sourceTicket.userId}> Your ticket has been merged here — please continue the conversation in this channel.`);

    // 4. DM the source opener
    try {
      const sourceUser = await guild.client.users.fetch(sourceTicket.userId);
      const dmEmbed = new EmbedBuilder()
        .setTitle(`Ticket #${sourcePadded} Merged`)
        .setColor(sourceConfig.color)
        .setDescription(
          `Your **${sourceConfig.label}** ticket has been merged into **${targetConfig.label} #${targetPadded}**.\n\n**Reason:** ${reason}\n\nPlease continue the conversation here: <#${targetChannel.id}>`,
        )
        .setFooter({ text: "ahousedividedgame.com" })
        .setTimestamp();

      if (sourceTicket.subject) {
        dmEmbed.addFields({ name: "Your Original Subject", value: sourceTicket.subject });
      }

      await sourceUser.send({ embeds: [dmEmbed] });
    } catch {
      // DMs may be disabled
    }

    // 5. Log the merge
    const logChannelId = process.env.TICKET_LOG_CHANNEL_ID ?? "1483974417628270593";
    const logChannel = guild.channels.cache.get(logChannelId) as TextChannel | undefined;
    if (logChannel) {
      const mergeEmbed = new EmbedBuilder()
        .setTitle(`📎 Ticket Merged — #${sourcePadded} → #${targetPadded}`)
        .setColor(0x5865f2)
        .addFields(
          { name: "Source", value: `#${sourcePadded} (${sourceConfig.label}) — <@${sourceTicket.userId}>`, inline: true },
          { name: "Target", value: `#${targetPadded} (${targetConfig.label})`, inline: true },
          { name: "Merged by", value: `<@${staffMember.id}>`, inline: true },
          { name: "Reason", value: reason },
        )
        .setFooter({ text: "ahousedividedgame.com" })
        .setTimestamp();

      if (sourceTicket.subject) {
        mergeEmbed.addFields({ name: "Original Subject", value: sourceTicket.subject });
      }

      await logChannel.send({ embeds: [mergeEmbed] }).catch(() => {});
    }

    // 6. Remove source ticket from store and delete channel
    removeTicket(guild.id, sourceTicket.channelId);
    await sourceChannel.delete(`Ticket #${sourcePadded} merged into #${targetPadded} by ${staffMember.user.tag}`).catch(() => {});

    return { success: true };
  } catch (error) {
    console.error("Error merging tickets:", error);
    return { success: false, reason: "An unexpected error occurred while merging the tickets." };
  }
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