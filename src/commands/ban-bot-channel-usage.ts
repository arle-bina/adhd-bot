import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";
import {
  getBannedChannels,
  addBannedChannel,
  removeBannedChannel,
} from "../utils/channelBans.js";
import { standardFooter } from "../utils/helpers.js";

export const data = new SlashCommandBuilder()
  .setName("ban-bot-channel-usage")
  .setDescription("Restrict bot command usage in specific channels (Admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Ban bot command usage in a channel")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("The channel to restrict")
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
            ChannelType.AnnouncementThread,
            ChannelType.GuildForum,
          )
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Allow bot command usage in a channel again")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("The channel to unrestrict")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List channels where bot usage is banned"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: "This command can only be used inside a server.",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;

  if (subcommand === "add") {
    const channel = interaction.options.getChannel("channel", true);
    const added = addBannedChannel(guildId, channel.id);
    await interaction.reply({
      content: added
        ? `Bot commands are now **banned** in <#${channel.id}> for non-admin users.`
        : `<#${channel.id}> is already on the banned list.`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "remove") {
    const channel = interaction.options.getChannel("channel", true);
    const removed = removeBannedChannel(guildId, channel.id);
    await interaction.reply({
      content: removed
        ? `Bot commands are now **allowed** in <#${channel.id}> again.`
        : `<#${channel.id}> was not on the banned list.`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "list") {
    const banned = getBannedChannels(guildId);
    const embed = new EmbedBuilder()
      .setTitle("Channels with Bot Usage Banned")
      .setColor(0xff6b6b)
      .setFooter(standardFooter(`${banned.length} channel(s)`));

    if (banned.length === 0) {
      embed.setDescription("No channels are currently banned. Bot commands can be used anywhere.");
    } else {
      embed.setDescription(banned.map((id) => `<#${id}>`).join("\n").slice(0, 4096));
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }
}
