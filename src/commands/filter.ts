import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { getFilteredTerms, addFilteredTerm, removeFilteredTerm } from "../utils/filter.js";

export const data = new SlashCommandBuilder()
  .setName("filter")
  .setDescription("Manage the content filter (Developer only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a term to the filter")
      .addStringOption((opt) =>
        opt.setName("term").setDescription("The term to filter").setRequired(true)
      )
      .addChannelOption((opt) =>
        opt.setName("channel1").setDescription("Limit to this channel (optional)").setRequired(false)
      )
      .addChannelOption((opt) =>
        opt.setName("channel2").setDescription("Additional channel (optional)").setRequired(false)
      )
      .addChannelOption((opt) =>
        opt.setName("channel3").setDescription("Additional channel (optional)").setRequired(false)
      )
      .addChannelOption((opt) =>
        opt.setName("channel4").setDescription("Additional channel (optional)").setRequired(false)
      )
      .addChannelOption((opt) =>
        opt.setName("channel5").setDescription("Additional channel (optional)").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a term from the filter")
      .addStringOption((opt) =>
        opt.setName("term").setDescription("The term to remove").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List all filtered terms")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  // Check for Developer role
  const member = interaction.member as GuildMember | null;
  const devRoleId = process.env.DEVELOPER_ROLE_ID;
  if (!member?.roles.cache.has(devRoleId!)) {
    await interaction.reply({
      content: "You don't have permission to use this command.",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "add") {
    const term = interaction.options.getString("term", true);
    const channelIds: string[] = [];
    for (const key of ["channel1", "channel2", "channel3", "channel4", "channel5"]) {
      const ch = interaction.options.getChannel(key);
      if (ch?.id) channelIds.push(ch.id);
    }

    const added = addFilteredTerm(term, channelIds);
    const scope = channelIds.length > 0
      ? ` in ${channelIds.map((id) => `<#${id}>`).join(", ")}`
      : " (all channels)";

    if (added) {
      await interaction.reply({
        content: `Added \`${term.toLowerCase()}\`${scope}.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `\`${term.toLowerCase()}\` is already in the filter.`,
        ephemeral: true,
      });
    }
  } else if (subcommand === "remove") {
    const term = interaction.options.getString("term", true);
    const removed = removeFilteredTerm(term);

    if (removed) {
      await interaction.reply({
        content: `Removed \`${term.toLowerCase()}\` from the filter.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `\`${term.toLowerCase()}\` was not in the filter.`,
        ephemeral: true,
      });
    }
  } else if (subcommand === "list") {
    const terms = getFilteredTerms();

    if (terms.length === 0) {
      await interaction.reply({
        content: "No terms in the filter.",
        ephemeral: true,
      });
      return;
    }

    const lines = terms.map((t) => {
      const scope = t.channels.length > 0
        ? ` — ${t.channels.map((id) => `<#${id}>`).join(", ")}`
        : " — all channels";
      return `\`${t.term}\`${scope}`;
    });

    const embed = new EmbedBuilder()
      .setTitle("Content Filter")
      .setDescription(lines.join("\n").slice(0, 4096))
      .setColor(0xff6b6b)
      .setFooter({ text: `${terms.length} term(s)` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
