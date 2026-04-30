import {
  Client,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
  ChatInputCommandInteraction,
  ActivityType,
  Partials,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  TextChannel,
} from "discord.js";
import { readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { validateEnv } from "./utils/env.js";
import { buildCategoryEmbed, buildSelectMenu } from "./commands/help.js";
import { checkCooldown } from "./utils/cooldown.js";
import { errorMessage, replyWithError } from "./utils/helpers.js";
import { recordMessage, recordMemberCount } from "./utils/statsStore.js";
import { handleStarboardReaction } from "./utils/starboard.js";
import { handleLockReaction, TICKET_CLOSE_MODAL_PREFIX, handleTicketCloseModalSubmit, TICKET_MERGE_MODAL_PREFIX, mergeTickets, TICKET_CLAIM_BUTTON_ID, handleClaimTicket } from "./utils/tickets.js";
import { getChannelConfig, postWebhookReaction } from "./utils/api-game.js";
import { getTicketByChannel, getTicketByNumber } from "./utils/ticketStore.js";
import { checkMessage } from "./utils/filter.js";
import { isBotEnabled } from "./utils/botState.js";
import { isChannelBanned } from "./utils/channelBans.js";
import { SUGGEST_MODAL_PREFIX, handleSuggestModal } from "./commands/suggest.js";

validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import type { AutocompleteInteraction } from "discord.js";

interface Command {
  data: { name: string };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
  cooldown?: number;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Reaction],
});

const commands = new Collection<string, Command>();

// Channel IDs for news/suggestions webhook reaction tracking — loaded from game config on ready
let newsChannelId: string | null = null;
let suggestionsChannelId: string | null = null;

// Track messages deleted by the content filter to avoid duplicate logs
const filterDeletedMessageIds = new Set<string>();

async function refreshChannelConfig() {
  try {
    const config = await getChannelConfig();
    newsChannelId = config.newsChannelId;
    suggestionsChannelId = config.suggestionsChannelId;
    console.log(`Channel config loaded — news: ${newsChannelId ?? "none"}, suggestions: ${suggestionsChannelId ?? "none"}`);
  } catch (err) {
    console.error("Failed to load channel config from game API:", err);
  }
}

const commandFiles = readdirSync(join(__dirname, "commands")).filter(
  (f) => f.endsWith(".js") || f.endsWith(".ts")
);

for (const file of commandFiles) {
  const baseName = file.replace(/\.(js|ts)$/, "");
  try {
    const mod = await import(`./commands/${baseName}.js`);
    if (mod.data && mod.execute) {
      commands.set(mod.data.name, mod as Command);
    }
  } catch (err) {
    console.error(`Failed to load command ${baseName}:`, err);
  }
}

client.once("ready", () => {
  console.log(`Bot ready as ${client.user?.tag} — ${commands.size} commands loaded`);

  // Set bot presence
  client.user?.setPresence({
    activities: [{ name: "/ticket for support", type: ActivityType.Custom }],
    status: "online",
  });

  // Load news/suggestions channel IDs from game config (admin panel webhook config)
  refreshChannelConfig();
  // Re-sync hourly in case the admin updates webhook URLs
  setInterval(refreshChannelConfig, 60 * 60 * 1000);

  // Snapshot member counts on startup and every hour
  const snapshotMembers = () => {
    for (const guild of client.guilds.cache.values()) {
      recordMemberCount(guild.id, guild.memberCount);
    }
  };
  snapshotMembers();
  setInterval(snapshotMembers, 60 * 60 * 1000);

  // Remind unverified users every 72 hours to read the rules and run /accept
  const remindUnverified = async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        const channel = guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID!) as TextChannel | undefined;
        if (!channel?.isTextBased()) continue;

        const embed = new EmbedBuilder()
          .setTitle("Reminder — Please Verify")
          .setDescription(
            `<@&${process.env.UNVERIFIED_ROLE_ID}>\n\nIf you haven't yet, please read the rules in <#${process.env.RULES_CHANNEL_ID}> and run \`/accept\` in this channel to gain access to the rest of the server.`,
          )
          .setColor(0x5865f2);

        await channel.send({
          content: `<@&${process.env.UNVERIFIED_ROLE_ID}>`,
          embeds: [embed],
          allowedMentions: { roles: [process.env.UNVERIFIED_ROLE_ID!] },
        });
      } catch (error) {
        console.error("Unverified reminder error:", error);
      }
    }
  };
  setInterval(remindUnverified, 72 * 60 * 60 * 1000);
});

// Track messages for server stats + content filter
client.on("messageCreate", async (message) => {
  // Add 👍/👎 to webhook posts in the configured news/suggestions channels
  if (message.webhookId && message.guild) {
    if ((newsChannelId && message.channelId === newsChannelId) ||
        (suggestionsChannelId && message.channelId === suggestionsChannelId)) {
      try {
        await message.react("👍");
        await message.react("👎");
      } catch {
        // non-fatal — bot may lack permissions or message was deleted
      }
    }
  }

  if (message.author.bot || !message.guild) return;
  recordMessage(message.guild.id);

  // Content filter check
  const matchedTerm = checkMessage(message.content, message.channelId);
  if (matchedTerm) {
    try {
      // Mark this message ID so the messageDelete handler skips logging it
      filterDeletedMessageIds.add(message.id);
      // Auto-cleanup after 30 seconds in case messageDelete never fires
      setTimeout(() => filterDeletedMessageIds.delete(message.id), 30_000);

      // Delete the message
      await message.delete();

      // Notify the user via DM (ephemeral-like)
      await message.author.send({
        content: `Your message in **${message.guild.name}** was removed because it contained a disallowed term. Please review the server rules.`,
      }).catch(() => {
        // If DMs are disabled, silently fail
      });

      // Log to moderation channel
      const logChannelId = process.env.FILTER_LOG_CHANNEL_ID;
      if (logChannelId) {
        const logChannel = message.guild.channels.cache.get(logChannelId) as TextChannel | undefined;
        if (logChannel?.isTextBased()) {
          const embed = new EmbedBuilder()
            .setTitle("Content Filter Triggered & Deleted")
            .setColor(0xff6b6b)
            .addFields(
              { name: "User", value: `${message.author} (${message.author.tag})`, inline: true },
              { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
              { name: "Matched Term", value: `\`${matchedTerm}\``, inline: true },
              { name: "Message Content", value: message.content.slice(0, 1000) || "(empty)" }
            )
            .setTimestamp();
          await logChannel.send({ embeds: [embed] });
        }
      }
    } catch (error) {
      console.error("Content filter error:", error);
    }
  }
});

// Reaction handlers (tickets + starboard + in-game reaction tracking)
client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) return;
    const fullReaction = reaction.partial ? await reaction.fetch() : reaction;
    if (fullReaction.message.partial) await fullReaction.message.fetch();
    if (!fullReaction.message.guild) return;

    // Resolve partial user
    const fullUser = user.partial ? await user.fetch() : user;

    // Ticket lock reaction (🔒)
    await handleLockReaction(fullReaction, fullUser, fullReaction.message.guild);

    // Starboard
    await handleStarboardReaction(fullReaction, fullReaction.message.guild);

    // In-game reaction tracking for news/suggestions webhook posts
    const emoji = fullReaction.emoji.name;
    if (emoji === "👍" || emoji === "👎") {
      const channelId = fullReaction.message.channelId;
      if ((newsChannelId && channelId === newsChannelId) ||
          (suggestionsChannelId && channelId === suggestionsChannelId)) {
        const channelType = channelId === newsChannelId ? "news" : "suggestion";
        postWebhookReaction({
          discordUserId: fullUser.id,
          messageId: fullReaction.message.id,
          channelType,
          emoji,
        }).catch(() => {
          // non-fatal — user may not be linked or item not found
        });
      }
    }
  } catch (error) {
    console.error("reactionAdd error:", error);
  }
});

client.on("messageReactionRemove", async (reaction, user) => {
  try {
    if (user.bot) return;
    const fullReaction = reaction.partial ? await reaction.fetch() : reaction;
    if (fullReaction.message.partial) await fullReaction.message.fetch();
    if (!fullReaction.message.guild) return;
    await handleStarboardReaction(fullReaction, fullReaction.message.guild);
  } catch (error) {
    console.error("Starboard reactionRemove error:", error);
  }
});

// Log deleted messages to moderation channel
client.on("messageDelete", async (message) => {
  try {
    if (message.partial) return; // No content available for uncached messages
    if (message.author?.bot) return;
    if (!message.guild) return;

    // Skip if this deletion was triggered by the content filter (already logged separately)
    if (filterDeletedMessageIds.has(message.id)) {
      filterDeletedMessageIds.delete(message.id);
      return;
    }

    // Check audit log to determine who deleted the message
    const auditLogs = await message.guild.fetchAuditLogs({ type: 72, limit: 1 }); // 72 = MessageDelete
    const deleteLog = auditLogs.entries.first();
    const deletedBySomeoneElse = deleteLog
      && deleteLog.target?.id === message.author?.id
      && deleteLog.executor?.id !== message.author?.id
      && Date.now() - deleteLog.createdTimestamp < 5000;

    const deletedByLabel = deletedBySomeoneElse
      ? `${deleteLog.executor} (${deleteLog.executor?.tag ?? "Unknown"})`
      : "Self";

    const logChannel = message.guild.channels.cache.get(process.env.FILTER_LOG_CHANNEL_ID!) as TextChannel | undefined;
    if (!logChannel?.isTextBased()) return;

    // Find first image attachment for embed
    const imageAttachment = message.attachments?.find((a) =>
      a.contentType?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(a.name ?? "")
    );

    // Collect any non-image attachment URLs to list
    const otherAttachments = [...(message.attachments?.values() ?? [])].filter(
      (a) => a !== imageAttachment
    );

    const embed = new EmbedBuilder()
      .setTitle("Message Deleted")
      .setColor(0x808080)
      .addFields(
        { name: "User", value: `${message.author} (${message.author?.tag ?? "Unknown"})`, inline: true },
        { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
        { name: "Deleted By", value: deletedByLabel, inline: true },
        { name: "Message Content", value: message.content?.slice(0, 1000) || "(empty or attachment-only)" }
      )
      .setTimestamp();

    if (imageAttachment?.url) {
      embed.setImage(imageAttachment.url);
    }

    if (otherAttachments.length > 0) {
      embed.addFields({
        name: "Other Attachments",
        value: otherAttachments.map((a) => `[${a.name}](${a.url})`).join("\n").slice(0, 1024),
      });
    }

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error("messageDelete error:", error);
  }
});

client.on("guildMemberAdd", async (member) => {
  try {
    // Assign unverified role
    await member.roles.add(process.env.UNVERIFIED_ROLE_ID!);

    const channel = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID!);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle("Welcome to the server!")
      .setDescription(
        `Hey ${member}! 👋\n\nWelcome to **${member.guild.name}**.\n\nPlease read the rules in <#${process.env.RULES_CHANNEL_ID}>, then run \`/accept\` in this channel to gain access to the rest of the server.`
      )
      .setColor(0x5865f2)
      .setThumbnail(member.user.displayAvatarURL());

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("guildMemberAdd error:", error);
  }
});

// Moderation logging: member leave/kick
client.on("guildMemberRemove", async (member) => {
  try {
    const logChannel = member.guild.channels.cache.get(process.env.FILTER_LOG_CHANNEL_ID!) as TextChannel | undefined;
    if (!logChannel?.isTextBased()) return;

    // Check audit log for kick
    const auditLogs = await member.guild.fetchAuditLogs({ type: 20, limit: 1 }); // 20 = MemberKick
    const kickLog = auditLogs.entries.first();
    const wasKicked = kickLog && kickLog.target?.id === member.id && Date.now() - kickLog.createdTimestamp < 5000;

    if (wasKicked) {
      const embed = new EmbedBuilder()
        .setTitle("Member Kicked")
        .setColor(0xffa500)
        .addFields(
          { name: "User", value: `${member.user.tag} (${member.id})`, inline: true },
          { name: "Kicked By", value: `${kickLog.executor?.tag ?? "Unknown"}`, inline: true },
          { name: "Reason", value: kickLog.reason || "No reason provided" }
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      await logChannel.send({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setTitle("Member Left")
        .setColor(0x808080)
        .addFields(
          { name: "User", value: `${member.user.tag} (${member.id})`, inline: true },
          { name: "Joined", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : "Unknown", inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      await logChannel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error("guildMemberRemove error:", error);
  }
});

// Moderation logging: ban
client.on("guildBanAdd", async (ban) => {
  try {
    const logChannel = ban.guild.channels.cache.get(process.env.FILTER_LOG_CHANNEL_ID!) as TextChannel | undefined;
    if (!logChannel?.isTextBased()) return;

    // Check audit log for ban details
    const auditLogs = await ban.guild.fetchAuditLogs({ type: 22, limit: 1 }); // 22 = MemberBanAdd
    const banLog = auditLogs.entries.first();
    const executor = banLog?.target?.id === ban.user.id ? banLog.executor : null;

    const embed = new EmbedBuilder()
      .setTitle("Member Banned")
      .setColor(0xff0000)
      .addFields(
        { name: "User", value: `${ban.user.tag} (${ban.user.id})`, inline: true },
        { name: "Banned By", value: executor?.tag ?? "Unknown", inline: true },
        { name: "Reason", value: ban.reason || banLog?.reason || "No reason provided" }
      )
      .setThumbnail(ban.user.displayAvatarURL())
      .setTimestamp();
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error("guildBanAdd error:", error);
  }
});

// Moderation logging: timeout
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    const wasTimedOut = !oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil;
    if (!wasTimedOut) return;

    const logChannel = newMember.guild.channels.cache.get(process.env.FILTER_LOG_CHANNEL_ID!) as TextChannel | undefined;
    if (!logChannel?.isTextBased()) return;

    // Check audit log for timeout details
    const auditLogs = await newMember.guild.fetchAuditLogs({ type: 24, limit: 1 }); // 24 = MemberUpdate
    const timeoutLog = auditLogs.entries.first();
    const executor = timeoutLog?.target?.id === newMember.id ? timeoutLog.executor : null;

    const embed = new EmbedBuilder()
      .setTitle("Member Timed Out")
      .setColor(0xffcc00)
      .addFields(
        { name: "User", value: `${newMember.user.tag} (${newMember.id})`, inline: true },
        { name: "Timed Out By", value: executor?.tag ?? "Unknown", inline: true },
        { name: "Until", value: `<t:${Math.floor(newMember.communicationDisabledUntil.getTime() / 1000)}:R>`, inline: true },
        { name: "Reason", value: timeoutLog?.reason || "No reason provided" }
      )
      .setThumbnail(newMember.user.displayAvatarURL())
      .setTimestamp();
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error("guildMemberUpdate timeout error:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isStringSelectMenu() && interaction.customId === "help_category") {
    const embed = buildCategoryEmbed(interaction.values[0]);
    if (!embed) return;
    await interaction.update({ embeds: [embed], components: [buildSelectMenu()] });
    return;
  }

  // Ticket panel buttons → show modal
  if (interaction.isButton() && interaction.customId.startsWith("ticket_panel_")) {
    try {
      const category = interaction.customId.replace("ticket_panel_", "");

      // Suggestions go through /suggest, not tickets — railroad anyone who
      // clicks the legacy Suggestion button on an older deployed panel.
      if (category === "suggestion") {
        await interaction.reply({
          content:
            "💡 Suggestions don't go through tickets — please run `/suggest` so your idea gets posted on the site for the team to review.",
          ephemeral: true,
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${category}`)
        .setTitle("Open a Ticket");

      const subjectInput = new TextInputBuilder()
        .setCustomId("ticket_subject")
        .setLabel("Subject")
        .setPlaceholder("Brief summary of your issue")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);

      const descriptionInput = new TextInputBuilder()
        .setCustomId("ticket_description")
        .setLabel("Description (optional)")
        .setPlaceholder("Any additional details...")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
      );

      await interaction.showModal(modal);
    } catch (error) {
      console.error("Ticket panel button error:", error);
    }
    return;
  }

  // Suggest modal submission
  if (interaction.isModalSubmit() && interaction.customId.startsWith(SUGGEST_MODAL_PREFIX)) {
    try {
      await handleSuggestModal(interaction);
    } catch (error) {
      console.error("Suggest modal error:", error);
    }
    return;
  }

  // Ticket close — resolution modal (/close-ticket, Close button, or 🔒 flow)
  if (interaction.isModalSubmit() && interaction.customId.startsWith(TICKET_CLOSE_MODAL_PREFIX)) {
    try {
      await handleTicketCloseModalSubmit(interaction);
    } catch (error) {
      console.error("Ticket close modal error:", error);
    }
    return;
  }

  // Ticket merge modal submission
  if (interaction.isModalSubmit() && interaction.customId.startsWith(TICKET_MERGE_MODAL_PREFIX)) {
    try {
      if (!interaction.guild) {
        await interaction.reply({ content: "This can only be used inside a server.", ephemeral: true });
        return;
      }

      // Parse channel IDs from customId: ticket_merge_modal_<sourceChannelId>:<targetChannelId>
      const payload = interaction.customId.slice(TICKET_MERGE_MODAL_PREFIX.length);
      const [sourceChannelId, targetChannelId] = payload.split(":");
      const reason = interaction.fields.getTextInputValue("merge_reason").trim();

      const sourceChannel = interaction.guild.channels.cache.get(sourceChannelId) as TextChannel | undefined;
      const targetChannel = interaction.guild.channels.cache.get(targetChannelId) as TextChannel | undefined;

      if (!sourceChannel || !targetChannel) {
        await interaction.reply({ content: "One of the ticket channels no longer exists.", ephemeral: true });
        return;
      }

      const sourceTicket = getTicketByChannel(interaction.guild.id, sourceChannelId);
      const targetTicket = getTicketByChannel(interaction.guild.id, targetChannelId);

      if (!sourceTicket || !targetTicket) {
        await interaction.reply({ content: "One of the tickets could not be found (may have been closed already).", ephemeral: true });
        return;
      }

      const member = interaction.guild.members.cache.get(interaction.user.id)
        ?? await interaction.guild.members.fetch(interaction.user.id);

      await interaction.deferReply({ ephemeral: true });

      const result = await mergeTickets(sourceChannel, targetChannel, sourceTicket, targetTicket, member, reason);
      if (result.success) {
        await interaction.editReply({ content: "Ticket merged successfully. The source ticket channel has been deleted." });
      } else {
        await interaction.editReply({ content: `Merge failed: ${result.reason}` });
      }
    } catch (error) {
      console.error("Ticket merge modal error:", error);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: "Something went wrong while merging the ticket.", ephemeral: true });
        } else {
          await interaction.reply({ content: "Something went wrong while merging the ticket.", ephemeral: true });
        }
      } catch { /* nothing */ }
    }
    return;
  }

  // Ticket modal submission (from both /ticket and panel buttons)
  if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket_modal_")) {
    try {
      const category = interaction.customId.replace("ticket_modal_", "");
      // Only handle panel-triggered modals here; /ticket handles its own via awaitModalSubmit
      // Panel modals come from button interactions, not command interactions
      if (!interaction.message) {
        // This is from /ticket's awaitModalSubmit — skip, it handles itself
        return;
      }
      // Suggestions go through /suggest — defense-in-depth against stale modals
      // from pre-rollout panels.
      if (category === "suggestion") {
        await interaction.reply({
          content:
            "💡 Suggestions don't go through tickets — please run `/suggest` so your idea gets posted on the site for the team to review.",
          ephemeral: true,
        });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const { createTicket } = await import("./utils/tickets.js");
      const subject = interaction.fields.getTextInputValue("ticket_subject");
      const description = interaction.fields.getTextInputValue("ticket_description") || undefined;

      const result = await createTicket(
        interaction.guild!,
        interaction.user.id,
        interaction.user.username,
        category as "bug" | "suggestion" | "moderation",
        { subject, description },
      );

      if (result.success) {
        await interaction.editReply({ content: `Ticket created: <#${result.channelId}>` });
      } else {
        await interaction.editReply({ content: result.reason });
      }
    } catch (error) {
      console.error("Ticket modal submit error:", error);
    }
    return;
  }

  // Ticket claim button
  if (interaction.isButton() && interaction.customId === TICKET_CLAIM_BUTTON_ID) {
    try {
      await interaction.deferUpdate();
      const member = interaction.guild?.members.cache.get(interaction.user.id)
        ?? await interaction.guild?.members.fetch(interaction.user.id);
      if (member && interaction.channel instanceof TextChannel) {
        await handleClaimTicket(interaction.channel, member, interaction);
      }
    } catch (error) {
      console.error("Ticket claim button error:", error);
    }
    return;
  }

  // Ticket close button
  if (interaction.isButton() && interaction.customId === "ticket_close") {
    try {
      const { closeTicket } = await import("./utils/tickets.js");
      const member = interaction.guild?.members.cache.get(interaction.user.id)
        ?? await interaction.guild?.members.fetch(interaction.user.id);
      if (member && interaction.channel) {
        if (interaction.channel instanceof TextChannel) {
          await closeTicket(interaction.channel, member, interaction);
        }
      }
    } catch (error) {
      console.error("Ticket close button error:", error);
    }
    return;
  }

  if (interaction.isAutocomplete()) {
    const acCommand = commands.get(interaction.commandName);
    if (acCommand?.autocomplete) {
      try {
        await acCommand.autocomplete(interaction);
      } catch (error) {
        console.error(`Autocomplete error for /${interaction.commandName}:`, error);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  // Block non-admin users when bot is disabled
  const ADMIN_ONLY_BYPASS = ["enable-bot", "disable-bot", "accept"];
  if (!isBotEnabled() && !ADMIN_ONLY_BYPASS.includes(interaction.commandName)) {
    const member = interaction.guild?.members.cache.get(interaction.user.id)
      ?? await interaction.guild?.members.fetch(interaction.user.id);
    if (!member?.permissions.has("Administrator")) {
      await interaction.reply({
        content: "The bot is currently disabled. Please try again later.",
        ephemeral: true,
      });
      return;
    }
  }

  // Block non-admin users in channels where bot usage has been banned
  if (
    interaction.guild &&
    interaction.commandName !== "ban-bot-channel-usage" &&
    isChannelBanned(interaction.guild.id, interaction.channelId)
  ) {
    const member = interaction.guild.members.cache.get(interaction.user.id)
      ?? await interaction.guild.members.fetch(interaction.user.id);
    if (!member?.permissions.has("Administrator")) {
      await interaction.reply({
        content: "Bot commands are not allowed in this channel.",
        ephemeral: true,
      });
      return;
    }
  }

  const remaining = checkCooldown(
    interaction.user.id,
    interaction.commandName,
    command.cooldown ?? 3
  );
  if (remaining > 0) {
    await interaction.reply({
      content: `Please wait **${remaining}s** before using \`/${interaction.commandName}\` again.`,
      ephemeral: true,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    // If the interaction hasn't been deferred yet, defer it so replyWithError
    // can use editReply (embeds require a deferred or replied interaction).
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferReply({ ephemeral: true });
      }
      await replyWithError(interaction, interaction.commandName, error);
    } catch (replyError) {
      // Last resort: if even the error embed fails, send plain text
      console.error("Failed to send error embed:", replyError);
      const summary = errorMessage(error);
      const fallback = {
        content: `**/${interaction.commandName}** failed: ${summary.slice(0, 300)}`,
        ephemeral: true,
      };
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(fallback);
        } else {
          await interaction.reply(fallback);
        }
      } catch {
        // Nothing more we can do
      }
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);