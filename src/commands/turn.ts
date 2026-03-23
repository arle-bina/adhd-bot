import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getTurnStatus } from "../utils/api.js";
import { replyWithError } from "../utils/helpers.js";

const TURNS_PER_YEAR = 48;

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("turn")
  .setDescription("Show the current game turn and clock");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const status = await getTurnStatus();

    const lastTs = Math.floor(new Date(status.lastTurnProcessed).getTime() / 1000);
    const nextTs = Math.floor(new Date(status.nextScheduledTurn).getTime() / 1000);
    const turnInYear = status.currentTurn % TURNS_PER_YEAR || TURNS_PER_YEAR;

    const embed = new EmbedBuilder()
      .setTitle("⏱️ Game Clock")
      .setColor(0x5865f2)
      .addFields(
        { name: "Turn", value: status.currentTurn.toLocaleString(), inline: true },
        { name: "Game Year", value: `Year ${status.currentYear}`, inline: true },
        { name: "Year Progress", value: `${turnInYear} / ${TURNS_PER_YEAR}`, inline: true },
        { name: "Last Processed", value: `<t:${lastTs}:R>`, inline: true },
        { name: "Next Turn", value: `<t:${nextTs}:R>`, inline: true }
      )
      .setFooter({ text: `${TURNS_PER_YEAR} turns = 1 game year  ·  ahousedividedgame.com` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "turn", error);
  }
}
