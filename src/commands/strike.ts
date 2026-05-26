import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
  type Guild,
  type User,
} from "discord.js";
import {
  addStrike,
  removeStrike,
  clearStrikes,
  getActiveStrikes,
  listUsersWithStrikes,
  STRIKE_THRESHOLD,
  STRIKE_DURATION_DAYS,
  type Strike,
} from "../utils/strikeStore.js";
import { standardFooter } from "../utils/helpers.js";

const STRIKE_COLOR = 0xed4245;
const NEUTRAL_COLOR = 0x5865f2;
const OK_COLOR = 0x57f287;

export const data = new SlashCommandBuilder()
  .setName("strike")
  .setDescription("Manage user strikes (4 strikes, 60-day expiry)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Give a user a strike")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("The user to strike").setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("reason")
          .setDescription("Why the strike is being issued")
          .setRequired(true)
          .setMaxLength(500),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a specific strike from a user")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("The user").setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("The strike ID (see /strike info)")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("clear")
      .setDescription("Remove every strike from a user")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("The user").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setDescription("View a user's strikes (defaults to yourself)")
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("The user to look up (mod only when not yourself)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List every user in the server with active strikes"),
  );

function moderatorRoleId(): string | undefined {
  const raw = process.env.SERVER_MODERATOR_ID?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

function logChannel(guild: Guild): TextChannel | null {
  const id = process.env.STRIKE_CHANNEL_ID ?? process.env.FILTER_LOG_CHANNEL_ID;
  if (!id) return null;
  const ch = guild.channels.cache.get(id);
  return ch && ch.isTextBased() ? (ch as TextChannel) : null;
}

function unix(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

function formatStrikeLine(strike: Strike, index: number): string {
  const added = unix(strike.addedAt);
  const expires = unix(strike.expiresAt);
  const reason = strike.reason.length > 0 ? strike.reason : "(no reason)";
  return [
    `**${index}. \`${strike.id}\`** — ${reason}`,
    `   Added <t:${added}:R> by ${strike.addedByTag} · expires <t:${expires}:R> (<t:${expires}:f>)`,
  ].join("\n");
}

function buildInfoEmbed(target: User, strikes: Strike[]): EmbedBuilder {
  const count = strikes.length;
  const atMax = count >= STRIKE_THRESHOLD;

  const embed = new EmbedBuilder()
    .setTitle(`Strikes — ${target.tag}`)
    .setThumbnail(target.displayAvatarURL())
    .setColor(count === 0 ? OK_COLOR : atMax ? STRIKE_COLOR : NEUTRAL_COLOR)
    .setFooter(
      standardFooter(
        `${count}/${STRIKE_THRESHOLD} active · strikes expire after ${STRIKE_DURATION_DAYS} days`,
      ),
    );

  if (count === 0) {
    embed.setDescription(`${target} has no active strikes.`);
    return embed;
  }

  const sorted = [...strikes].sort(
    (a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime(),
  );
  const lines = sorted.map((s, i) => formatStrikeLine(s, i + 1));
  const description = lines.join("\n\n").slice(0, 4000);
  embed.setDescription(description);

  if (atMax) {
    embed.addFields({
      name: "Threshold reached",
      value: `User has hit **${STRIKE_THRESHOLD}** active strikes — moderator review required.`,
    });
  }

  return embed;
}

async function dmStrikeAdded(
  target: User,
  guildName: string,
  strike: Strike,
  activeCount: number,
  reachedThreshold: boolean,
): Promise<boolean> {
  const expires = unix(strike.expiresAt);
  const embed = new EmbedBuilder()
    .setTitle(`You received a strike in ${guildName}`)
    .setColor(STRIKE_COLOR)
    .addFields(
      { name: "Reason", value: strike.reason || "(no reason provided)" },
      { name: "Strike ID", value: `\`${strike.id}\``, inline: true },
      { name: "Active strikes", value: `${activeCount}/${STRIKE_THRESHOLD}`, inline: true },
      {
        name: "Expires",
        value: `<t:${expires}:R> (<t:${expires}:f>)`,
        inline: true,
      },
    )
    .setFooter(
      standardFooter(`Strikes expire after ${STRIKE_DURATION_DAYS} days`),
    )
    .setTimestamp();

  if (reachedThreshold) {
    embed.addFields({
      name: "Threshold reached",
      value: `You've hit **${STRIKE_THRESHOLD}** active strikes. Moderators have been notified for review.`,
    });
  }

  try {
    await target.send({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}

async function logStrikeAdded(
  guild: Guild,
  target: User,
  moderator: User,
  strike: Strike,
  activeCount: number,
  reachedThreshold: boolean,
  dmDelivered: boolean,
): Promise<void> {
  const channel = logChannel(guild);
  if (!channel) return;
  const expires = unix(strike.expiresAt);

  const embed = new EmbedBuilder()
    .setTitle(reachedThreshold ? "Strike Added — Threshold Reached" : "Strike Added")
    .setColor(STRIKE_COLOR)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "User", value: `${target} (${target.tag} · ${target.id})`, inline: false },
      { name: "Moderator", value: `${moderator} (${moderator.tag})`, inline: true },
      { name: "Active strikes", value: `${activeCount}/${STRIKE_THRESHOLD}`, inline: true },
      { name: "Expires", value: `<t:${expires}:R>`, inline: true },
      { name: "Reason", value: strike.reason || "(no reason provided)" },
      { name: "Strike ID", value: `\`${strike.id}\``, inline: true },
      { name: "DM delivered", value: dmDelivered ? "Yes" : "No (DMs closed)", inline: true },
    )
    .setTimestamp();

  const modRoleId = moderatorRoleId();
  const content = reachedThreshold && modRoleId ? `<@&${modRoleId}>` : undefined;

  await channel.send({
    content,
    embeds: [embed],
    allowedMentions: reachedThreshold && modRoleId ? { roles: [modRoleId] } : { parse: [] },
  });
}

async function logStrikeRemoved(
  guild: Guild,
  target: User,
  moderator: User,
  removed: Strike,
  remaining: number,
): Promise<void> {
  const channel = logChannel(guild);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("Strike Removed")
    .setColor(OK_COLOR)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "User", value: `${target} (${target.tag} · ${target.id})`, inline: false },
      { name: "Moderator", value: `${moderator} (${moderator.tag})`, inline: true },
      { name: "Remaining strikes", value: `${remaining}/${STRIKE_THRESHOLD}`, inline: true },
      { name: "Original reason", value: removed.reason || "(no reason)" },
      { name: "Strike ID", value: `\`${removed.id}\``, inline: true },
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

async function logStrikesCleared(
  guild: Guild,
  target: User,
  moderator: User,
  count: number,
): Promise<void> {
  const channel = logChannel(guild);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("Strikes Cleared")
    .setColor(OK_COLOR)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "User", value: `${target} (${target.tag} · ${target.id})`, inline: false },
      { name: "Moderator", value: `${moderator} (${moderator.tag})`, inline: true },
      { name: "Strikes cleared", value: `${count}`, inline: true },
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: "This command can only be used inside a server.",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const guild = interaction.guild;

  if (subcommand === "info") {
    const targetUser = interaction.options.getUser("user") ?? interaction.user;
    const isSelf = targetUser.id === interaction.user.id;

    if (!isSelf) {
      const member =
        interaction.guild.members.cache.get(interaction.user.id) ??
        (await interaction.guild.members.fetch(interaction.user.id));
      if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        await interaction.reply({
          content: "You can only view your own strikes.",
          ephemeral: true,
        });
        return;
      }
    }

    const strikes = getActiveStrikes(guild.id, targetUser.id);
    const embed = buildInfoEmbed(targetUser, strikes);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // add/remove/clear/list all require ModerateMembers — already enforced by
  // setDefaultMemberPermissions, but check explicitly for safety.
  const member =
    interaction.guild.members.cache.get(interaction.user.id) ??
    (await interaction.guild.members.fetch(interaction.user.id));
  if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    await interaction.reply({
      content: "You need the Moderate Members permission to manage strikes.",
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "list") {
    const summaries = listUsersWithStrikes(guild.id);
    const embed = new EmbedBuilder()
      .setTitle("Users with active strikes")
      .setColor(summaries.length === 0 ? OK_COLOR : STRIKE_COLOR)
      .setFooter(
        standardFooter(
          `${summaries.length} user(s) · ${STRIKE_THRESHOLD}-strike threshold`,
        ),
      )
      .setTimestamp();

    if (summaries.length === 0) {
      embed.setDescription("No users currently have active strikes.");
    } else {
      const lines = summaries.map((s) => {
        const count = s.strikes.length;
        const flag = count >= STRIKE_THRESHOLD ? " ⚠️" : "";
        const newest = s.strikes.reduce((a, b) =>
          new Date(a.addedAt) > new Date(b.addedAt) ? a : b,
        );
        const newestTs = unix(newest.addedAt);
        return `<@${s.userId}> — **${count}**/${STRIKE_THRESHOLD}${flag} · most recent <t:${newestTs}:R>`;
      });
      embed.setDescription(lines.join("\n").slice(0, 4000));
    }

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (subcommand === "add") {
    const targetUser = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true).trim();

    if (targetUser.bot) {
      await interaction.reply({
        content: "Bots can't receive strikes.",
        ephemeral: true,
      });
      return;
    }
    if (targetUser.id === interaction.user.id) {
      await interaction.reply({
        content: "You can't strike yourself.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const result = addStrike(
      guild.id,
      targetUser.id,
      reason,
      interaction.user.id,
      interaction.user.tag,
    );

    const dmDelivered = await dmStrikeAdded(
      targetUser,
      guild.name,
      result.strike,
      result.activeCount,
      result.reachedThreshold,
    );

    await logStrikeAdded(
      guild,
      targetUser,
      interaction.user,
      result.strike,
      result.activeCount,
      result.reachedThreshold,
      dmDelivered,
    );

    const expires = unix(result.strike.expiresAt);
    const reply = new EmbedBuilder()
      .setTitle("Strike issued")
      .setColor(STRIKE_COLOR)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: "User", value: `${targetUser} (${targetUser.tag})`, inline: false },
        { name: "Reason", value: result.strike.reason || "(no reason)" },
        { name: "Strike ID", value: `\`${result.strike.id}\``, inline: true },
        {
          name: "Active strikes",
          value: `${result.activeCount}/${STRIKE_THRESHOLD}`,
          inline: true,
        },
        { name: "Expires", value: `<t:${expires}:R>`, inline: true },
        {
          name: "DM",
          value: dmDelivered
            ? "Delivered."
            : "Could not DM the user (DMs may be closed).",
        },
      )
      .setFooter(standardFooter())
      .setTimestamp();

    if (result.reachedThreshold) {
      const modRoleId = moderatorRoleId();
      reply.addFields({
        name: "Threshold reached",
        value: modRoleId
          ? `User has hit **${STRIKE_THRESHOLD}** active strikes — moderators pinged in the log channel.`
          : `User has hit **${STRIKE_THRESHOLD}** active strikes — review required.`,
      });
    }

    await interaction.editReply({ embeds: [reply] });
    return;
  }

  if (subcommand === "remove") {
    const targetUser = interaction.options.getUser("user", true);
    const strikeId = interaction.options.getString("id", true).trim();

    const removed = removeStrike(guild.id, targetUser.id, strikeId);
    if (!removed) {
      await interaction.reply({
        content: `No strike with ID \`${strikeId}\` found for ${targetUser.tag}.`,
        ephemeral: true,
      });
      return;
    }

    const remaining = getActiveStrikes(guild.id, targetUser.id).length;

    await logStrikeRemoved(guild, targetUser, interaction.user, removed, remaining);

    const embed = new EmbedBuilder()
      .setTitle("Strike removed")
      .setColor(OK_COLOR)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: "User", value: `${targetUser} (${targetUser.tag})` },
        { name: "Strike ID", value: `\`${removed.id}\``, inline: true },
        {
          name: "Remaining strikes",
          value: `${remaining}/${STRIKE_THRESHOLD}`,
          inline: true,
        },
        { name: "Original reason", value: removed.reason || "(no reason)" },
      )
      .setFooter(standardFooter())
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (subcommand === "clear") {
    const targetUser = interaction.options.getUser("user", true);
    const count = clearStrikes(guild.id, targetUser.id);

    if (count === 0) {
      await interaction.reply({
        content: `${targetUser.tag} had no strikes to clear.`,
        ephemeral: true,
      });
      return;
    }

    await logStrikesCleared(guild, targetUser, interaction.user, count);

    await interaction.reply({
      content: `Cleared **${count}** strike(s) from ${targetUser.tag}.`,
      ephemeral: true,
    });
    return;
  }
}
