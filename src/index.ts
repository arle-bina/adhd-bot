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
import { handleLockReaction, TICKET_CLOSE_MODAL_PREFIX, handleTicketCloseModalSubmit } from "./utils/tickets.js";
import { checkMessage } from "./utils/filter.js";
import { isBotEnabled } from "./utils/botState.js";

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

  // Snapshot member counts on startup and every hour
  const snapshotMembers = () => {
    for (const guild of client.guilds.cache.values()) {
      recordMemberCount(guild.id, guild.memberCount);
    }
  };
  snapshotMembers();
  setInterval(snapshotMembers, 60 * 60 * 1000);
});

// Track messages for server stats + content filter
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  recordMessage(message.guild.id);

  // Content filter check
  const matchedTerm = checkMessage(message.content);
  if (matchedTerm) {
    try {
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
            .setTitle("Content Filter Triggered")
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

// Reaction handlers (tickets + starboard)
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

  // Ticket close — resolution modal (/close-ticket, Close button, or 🔒 flow)
  if (interaction.isModalSubmit() && interaction.customId.startsWith(TICKET_CLOSE_MODAL_PREFIX)) {
    try {
      await handleTicketCloseModalSubmit(interaction);
    } catch (error) {
      console.error("Ticket close modal error:", error);
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
  const ADMIN_ONLY_BYPASS = ["enable-bot", "disable-bot"];
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
