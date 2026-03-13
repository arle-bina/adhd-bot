import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getLeaderboard, LeaderboardCharacter, LeaderboardMetric } from "../utils/api.js";
import { replyWithError } from "../utils/helpers.js";

// Explicit conditional avoids TypeScript's TS7053 "any" error from dynamic key indexing (char[metric]).
export function getMetricValue(
  char: LeaderboardCharacter,
  metric: LeaderboardMetric
): number {
  if (metric === "favorability") return char.favorability;
  if (metric === "nationalPoliticalInfluence") return char.nationalPoliticalInfluence;
  if (metric === "actions") return char.actions;
  if (metric === "funds") return char.funds;
  return char.politicalInfluence;
}

export const cooldown = 10;

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show top politicians ranked by various metrics")
  .addStringOption((option) =>
    option
      .setName("metric")
      .setDescription("What to rank by")
      .setRequired(false)
      .addChoices(
        { name: "Political Influence (default)", value: "influence" },
        { name: "National Political Influence", value: "nationalPoliticalInfluence" },
        { name: "Favorability", value: "favorability" },
        { name: "Actions", value: "actions" },
        { name: "Funds", value: "funds" }
      )
  )
  .addStringOption((option) =>
    option
      .setName("country")
      .setDescription("Filter by country")
      .setRequired(false)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" }
      )
  )
  .addIntegerOption((option) =>
    option
      .setName("limit")
      .setDescription("Number of results (max 25, default 10)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(25)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const metric = interaction.options.getString("metric") ?? "influence";
  const country = interaction.options.getString("country") ?? undefined;
  const limit = interaction.options.getInteger("limit") ?? 10;

  await interaction.deferReply();

  try {
    const result = await getLeaderboard({ metric, country, limit });

    if (!result.found || result.characters.length === 0) {
      await interaction.editReply({ content: "No politicians found." });
      return;
    }

    const metricLabels: Record<LeaderboardMetric, string> = {
      politicalInfluence: "Political Influence",
      nationalPoliticalInfluence: "National Political Influence",
      favorability: "Favorability",
      actions: "Actions",
      funds: "Funds",
    };
    const metricLabel = metricLabels[result.metric];

    const lines = result.characters.map((char) => {
      const value = getMetricValue(char, result.metric).toLocaleString();
      return `${char.rank}. **${char.name}** — ${char.position} · ${char.party} · 📊 ${value}`;
    });

    const footerParts = ["ahousedivided.com"];
    if (country) footerParts.push(`Country: ${country}`);

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Top Politicians — ${metricLabel}`)
      .setColor(0x2b2d31)
      .setDescription(lines.join("\n"))
      .setFooter({ text: footerParts.join(" · ") });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "leaderboard", error);
  }
}
