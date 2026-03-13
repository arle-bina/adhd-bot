import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { lookupByDiscordId } from "../utils/api.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("me")
  .setDescription("View your own character profile");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await lookupByDiscordId(interaction.user.id);

    if (!result.found || result.characters.length === 0) {
      await interaction.editReply({
        content:
          "No characters linked to your Discord account. Try `/profile name:YourCharacterName` or connect your Discord on the website.",
      });
      return;
    }

    const embeds = result.characters.slice(0, 5).map((char) => {
      const embed = new EmbedBuilder()
        .setTitle(char.name)
        .setColor(parseInt(char.partyColor.replace("#", ""), 16))
        .addFields(
          { name: "Position", value: char.position || "None", inline: true },
          { name: "Party", value: char.party, inline: true },
          { name: "State", value: char.state, inline: true }
        )
        .setURL(char.profileUrl);

      if (char.avatarUrl) embed.setThumbnail(char.avatarUrl);
      return embed;
    });

    const buttons = result.characters.slice(0, 5).map((char) =>
      new ButtonBuilder()
        .setLabel(`View ${char.name}`)
        .setStyle(ButtonStyle.Link)
        .setURL(char.profileUrl)
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

    await interaction.editReply({
      embeds,
      components: buttons.length > 0 ? [row] : [],
    });
  } catch (error) {
    console.error("Me error:", error);
    await interaction.editReply({ content: "An error occurred while loading your profile." });
  }
}
