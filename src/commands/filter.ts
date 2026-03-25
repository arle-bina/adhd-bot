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
    const added = addFilteredTerm(term);

    if (added) {
      await interaction.reply({
        content: `Added \`${term.toLowerCase()}\` to the filter.`,
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

    const embed = new EmbedBuilder()
      .setTitle("Content Filter")
      .setDescription(terms.map((t) => `\`${t}\``).join(", "))
      .setColor(0xff6b6b)
      .setFooter({ text: `${terms.length} term(s)` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
