import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getPrediction, ApiError } from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("predict")
  .setDescription("Show seat predictions for a legislative chamber")
  .addStringOption((option) =>
    option
      .setName("country")
      .setDescription("Country to predict")
      .setRequired(true)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" },
        { name: "Canada", value: "CA" },
        { name: "Germany", value: "DE" },
      )
  )
  .addStringOption((option) =>
    option
      .setName("race")
      .setDescription("Legislative chamber")
      .setRequired(true)
      .addChoices(
        { name: "Senate (US)", value: "senate" },
        { name: "House (US)", value: "house" },
        { name: "Commons (UK/CA)", value: "commons" },
        { name: "Bundestag (DE)", value: "bundestag" },
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const country = interaction.options.getString("country", true);
  const race = interaction.options.getString("race", true);

  await interaction.deferReply();

  try {
    const result = await getPrediction({ country, race });

    const embedColor = result.projected.length > 0
      ? hexToInt(result.projected[0].partyColor)
      : hexToInt(null);

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${result.chamberName} Seat Prediction`)
      .setColor(embedColor)
      .setFooter({ text: `ahousedivided.com · ${result.countryName}` });

    if (!result.inGeneral) {
      embed.setDescription("No general elections active — showing current seats only.");
    }

    // Current Seats field
    const currentLines = result.current
      .map((entry) => `${entry.partyName}: ${entry.seats}`)
      .join("\n");
    embed.addFields({ name: "Current Seats", value: currentLines || "None" });

    // Projected Seats field (only when general elections are active)
    if (result.inGeneral) {
      const projectedLines = result.projected
        .map((entry) => `${entry.partyName}: ${entry.seats}`)
        .join("\n");
      embed.addFields({ name: "Projected Seats", value: projectedLines || "None" });
    }

    // Senate Class inline field
    if (race === "senate" && result.activeSenateClass != null) {
      embed.addFields({ name: "Senate Class", value: `Class ${result.activeSenateClass}`, inline: true });
    }

    // Cycle inline field
    if (result.cycle != null) {
      embed.addFields({ name: "Cycle", value: `${result.cycle}`, inline: true });
    }

    // Total Seats inline field
    embed.addFields({ name: "Total Seats", value: `${result.totalSeats}`, inline: true });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 400) {
        let message = "Invalid request — check your inputs.";
        try {
          const body = JSON.parse(error.responseBody);
          if (body.error) message = body.error;
        } catch { /* use default */ }
        await interaction.editReply({ content: message });
        return;
      }
      if (error.status === 401) {
        await interaction.editReply({ content: "Bot configuration error — contact an admin." });
        return;
      }
    }
    if (
      error instanceof TypeError ||
      error instanceof Error && (
        error.name === "TimeoutError" ||
        ("errors" in error && Array.isArray((error as AggregateError).errors))
      )
    ) {
      await interaction.editReply({ content: "Could not reach the game server. Try again shortly." });
      return;
    }
    await replyWithError(interaction, "predict", error);
  }
}
