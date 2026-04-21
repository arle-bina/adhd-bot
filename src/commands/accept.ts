import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { getSyncRoles } from "../utils/api.js";
import { syncMemberRoles } from "../utils/roles.js";
import { replyWithError } from "../utils/helpers.js";

const BETA_TESTER_ROLE_ID = "1490410327387541687";

export const data = new SlashCommandBuilder()
  .setName("accept")
  .setDescription("Accept the server rules and gain access");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const member = interaction.guild?.members.cache.get(interaction.user.id)
    ?? await interaction.guild?.members.fetch(interaction.user.id);

  if (!member) {
    await interaction.editReply({ content: "Could not find your server profile. Try again." });
    return;
  }

  if (member.roles.cache.has(process.env.MEMBER_ROLE_ID!)) {
    await interaction.editReply({ content: "You already have access." });
    return;
  }

  try {
    await member.roles.remove(process.env.UNVERIFIED_ROLE_ID!);
    await member.roles.add(process.env.MEMBER_ROLE_ID!);
    await member.roles.add(BETA_TESTER_ROLE_ID);
    await interaction.editReply({ content: "✅ Welcome! You now have access to the server." });

    // Post welcome message in general channel
    try {
      const generalChannel = interaction.guild?.channels.cache.get(process.env.GENERAL_CHANNEL_ID!) as TextChannel | undefined;
      if (generalChannel?.isTextBased()) {
        const welcomeEmbed = new EmbedBuilder()
          .setTitle("A new member has joined!")
          .setDescription(`Welcome ${member} to **${interaction.guild!.name}**! 🎉`)
          .setColor(0x57f287)
          .setThumbnail(member.user.displayAvatarURL());
        await generalChannel.send({ embeds: [welcomeEmbed] });
      }
    } catch (error) {
      console.error("General welcome post error:", error);
    }

    // Best-effort: sync game roles if account is linked
    getSyncRoles(interaction.user.id).then(async (result) => {
      if (result.found && result.roles.length > 0) {
        await syncMemberRoles(member as GuildMember, result.roles, result.details);
      }
    }).catch(() => {});
  } catch (error) {
    await replyWithError(interaction, "accept", error);
  }
}
