import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";
import { getConfig, setConfig, type StarboardConfig } from "../utils/starboardStore.js";

const DEFAULT_CONFIG: Omit<StarboardConfig, "channelId"> = {
  emoji: "⭐",
  threshold: 3,
  selfStar: false,
  enabled: true,
};

export const data = new SlashCommandBuilder()
  .setName("starboard")
  .setDescription("Configure the starboard — repost messages that earn enough star reactions")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("Channel where starred messages are reposted")
      .addChannelTypes(ChannelType.GuildText),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("threshold")
      .setDescription("Minimum reactions needed (default: 3)")
      .setMinValue(1)
      .setMaxValue(50),
  )
  .addStringOption((opt) =>
    opt
      .setName("emoji")
      .setDescription("Emoji to track (default: ⭐)"),
  )
  .addBooleanOption((opt) =>
    opt
      .setName("self-star")
      .setDescription("Allow message authors to star their own messages (default: false)"),
  )
  .addBooleanOption((opt) =>
    opt
      .setName("enabled")
      .setDescription("Enable or disable the starboard"),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel("channel");
  const threshold = interaction.options.getInteger("threshold");
  const emoji = interaction.options.getString("emoji");
  const selfStar = interaction.options.getBoolean("self-star");
  const enabled = interaction.options.getBoolean("enabled");

  const hasUpdates = channel !== null || threshold !== null || emoji !== null || selfStar !== null || enabled !== null;
  const existing = getConfig(interaction.guild.id);

  // No options provided — show current config
  if (!hasUpdates) {
    if (!existing) {
      await interaction.reply({
        content: "Starboard is not configured yet. Use `/starboard channel:#channel` to set it up.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("Starboard Configuration")
      .addFields(
        { name: "Channel", value: `<#${existing.channelId}>`, inline: true },
        { name: "Emoji", value: existing.emoji, inline: true },
        { name: "Threshold", value: `${existing.threshold}`, inline: true },
        { name: "Self-star", value: existing.selfStar ? "Allowed" : "Not allowed", inline: true },
        { name: "Status", value: existing.enabled ? "Enabled" : "Disabled", inline: true },
      )
      .setFooter({ text: "ahousedividedgame.com" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // First-time setup requires a channel
  if (!existing && !channel) {
    await interaction.reply({
      content: "Starboard hasn't been set up yet. Please provide a channel: `/starboard channel:#starboard`",
      ephemeral: true,
    });
    return;
  }

  // Validate emoji — must be a single standard emoji or a Discord custom emoji pattern
  let resolvedEmoji = emoji ?? existing?.emoji ?? DEFAULT_CONFIG.emoji;
  if (emoji !== null) {
    const customEmojiMatch = emoji.match(/^<a?:\w+:(\d+)>$/);
    if (!customEmojiMatch) {
      // Check if it's a single Unicode emoji (rough check: 1-2 code points, no letters/digits)
      const codePoints = [...emoji];
      if (codePoints.length === 0 || codePoints.length > 2 || /^[a-zA-Z0-9]/.test(emoji)) {
        await interaction.reply({
          content: "Invalid emoji. Use a standard emoji (e.g. ⭐) or a custom server emoji.",
          ephemeral: true,
        });
        return;
      }
    }
    resolvedEmoji = emoji;
  }

  const config: StarboardConfig = {
    channelId: channel?.id ?? existing?.channelId ?? "",
    emoji: resolvedEmoji,
    threshold: threshold ?? existing?.threshold ?? DEFAULT_CONFIG.threshold,
    selfStar: selfStar ?? existing?.selfStar ?? DEFAULT_CONFIG.selfStar,
    enabled: enabled ?? existing?.enabled ?? DEFAULT_CONFIG.enabled,
  };

  setConfig(interaction.guild.id, config);

  const changes: string[] = [];
  if (channel !== null) changes.push(`**Channel:** <#${channel.id}>`);
  if (threshold !== null) changes.push(`**Threshold:** ${threshold}`);
  if (emoji !== null) changes.push(`**Emoji:** ${resolvedEmoji}`);
  if (selfStar !== null) changes.push(`**Self-star:** ${selfStar ? "Allowed" : "Not allowed"}`);
  if (enabled !== null) changes.push(`**Status:** ${enabled ? "Enabled" : "Disabled"}`);

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("Starboard Updated")
    .setDescription(changes.join("\n"))
    .setFooter({ text: "ahousedividedgame.com" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
