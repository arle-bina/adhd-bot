import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";

const MEMBER_ROLE_ID = "1470502115716894846";

export const data = new SlashCommandBuilder()
  .setName("accept")
  .setDescription("Accept the server rules and gain access");

export async function execute(interaction: ChatInputCommandInteraction) {
  const member = interaction.guild?.members.cache.get(interaction.user.id)
    ?? await interaction.guild?.members.fetch(interaction.user.id);

  if (!member) {
    await interaction.reply({ content: "Could not find your server profile. Try again.", ephemeral: true });
    return;
  }

  if (member.roles.cache.has(MEMBER_ROLE_ID)) {
    await interaction.reply({ content: "You already have access.", ephemeral: true });
    return;
  }

  try {
    await member.roles.add(MEMBER_ROLE_ID);
    await interaction.reply({ content: "✅ Welcome! You now have access to the server.", ephemeral: true });
  } catch (error) {
    console.error("Accept role error:", error);
    await interaction.reply({ content: "Could not assign your role. Please contact an admin.", ephemeral: true });
  }
}
