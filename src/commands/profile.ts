import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { lookupByName, lookupByDiscordId } from "../utils/api.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("View a player profile")
  .addStringOption((option) =>
    option.setName("name").setDescription("Character name to search for").setRequired(false)
  )
  .addUserOption((option) =>
    option.setName("user").setDescription("Discord user to look up").setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const name = interaction.options.getString("name");
  const user = interaction.options.getUser("user");

  if (!name && !user) {
    await interaction.reply({
      content: "Please provide either a character name or a Discord user.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const result = user ? await lookupByDiscordId(user.id) : await lookupByName(name!);

    if (!result.found || result.characters.length === 0) {
      await interaction.editReply({
        content: user
          ? `No linked account found for ${user.username}.`
          : `No characters found matching "${name}".`,
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

      if (char.avatarUrl) {
        embed.setThumbnail(char.avatarUrl);
      }

      return embed;
    });

    const buttons = result.characters
      .slice(0, 5)
      .map((char) =>
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
    console.error("Lookup error:", error);
    await interaction.editReply({
      content: "An error occurred while looking up the player.",
    });
  }
}
