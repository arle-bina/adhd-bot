import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { lookupByName } from "../utils/api.js";
import { hexToInt, logCommandError } from "../utils/helpers.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("compare")
  .setDescription("Compare two politicians side by side")
  .addStringOption((option) =>
    option
      .setName("politician1")
      .setDescription("First character name")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("politician2")
      .setDescription("Second character name")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const name1 = interaction.options.getString("politician1", true);
  const name2 = interaction.options.getString("politician2", true);

  await interaction.deferReply();

  try {
    const [result1, result2] = await Promise.all([lookupByName(name1), lookupByName(name2)]);

    if (!result1.found || result1.characters.length === 0) {
      await interaction.editReply({ content: `No character found matching "${name1}".` });
      return;
    }
    if (!result2.found || result2.characters.length === 0) {
      await interaction.editReply({ content: `No character found matching "${name2}".` });
      return;
    }

    const a = result1.characters[0];
    const b = result2.characters[0];

    const embed = new EmbedBuilder()
      .setTitle(`⚔️  ${a.name}  vs  ${b.name}`)
      .setColor(hexToInt(a.partyColor))
      .addFields(
        { name: a.name, value: `[View Profile](${a.profileUrl})`, inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: b.name, value: `[View Profile](${b.profileUrl})`, inline: true },

        { name: "Office", value: a.position || "None", inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: "Office", value: b.position || "None", inline: true },

        { name: "Party", value: a.party, inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: "Party", value: b.party, inline: true },

        { name: "State", value: a.state, inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: "State", value: b.state, inline: true }
      )
      .setFooter({ text: "ahousedividedgame.com" });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content: logCommandError("compare", error) });
  }
}
