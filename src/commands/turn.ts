import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { buildTurnView } from "../utils/featureViews.js";
import { replyWithError } from "../utils/helpers.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("turn")
  .setDescription("Show the current game turn, live processing progress and next turn countdown");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    await interaction.editReply(await buildTurnView());
  } catch (error) {
    await replyWithError(interaction, "turn", error);
  }
}
