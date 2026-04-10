import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";
import { getSyncRoles } from "../utils/api.js";
import { syncMemberRoles } from "../utils/roles.js";
import { replyWithError } from "../utils/helpers.js";

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
    await member.roles.add(process.env.ALPHA_TESTER_ROLE_ID!);
    await member.roles.add(process.env.BETA_TESTER_ROLE_ID!);
    await interaction.editReply({ content: "✅ Welcome! You now have access to the server." });

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
