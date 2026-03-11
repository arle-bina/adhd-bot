import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getElections } from "../utils/api.js";
import { errorMessage } from "../utils/helpers.js";

function formatElectionType(type: string): string {
  const map: Record<string, string> = {
    senate: "Senate",
    house: "House",
    governor: "Governor",
    president: "Presidential",
    commons: "Commons",
    primeMinister: "Prime Minister",
  };
  return map[type] ?? type;
}

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("elections")
  .setDescription("Show active and upcoming elections")
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
  .addStringOption((option) =>
    option
      .setName("state")
      .setDescription("Filter by state/region code (e.g. CA, TX)")
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const country = interaction.options.getString("country") ?? undefined;
  const state = interaction.options.getString("state") ?? undefined;

  await interaction.deferReply();

  try {
    const result = await getElections({ country, state });

    if (!result.found || result.elections.length === 0) {
      await interaction.editReply({ content: "No active or upcoming elections found." });
      return;
    }

    const total = result.elections.length;
    const shown = result.elections.slice(0, 5);

    const lines = shown.map((e) => {
      const typeLabel = formatElectionType(e.electionType);
      const candidateList =
        e.candidates.map((c) => `${c.characterName} (${c.party})`).join(", ") ||
        "No candidates yet";
      const timeStr = e.endTime
        ? `<t:${Math.floor(new Date(e.endTime).getTime() / 1000)}:R>`
        : "TBD";
      return `**[${typeLabel}] — ${e.state}** (${e.status})\nCandidates: ${candidateList}\nEnds: ${timeStr}`;
    });

    const embed = new EmbedBuilder()
      .setTitle("🗳️ Active & Upcoming Elections")
      .setColor(0x5865f2)
      .setDescription(lines.join("\n\n"));

    if (total > 5) {
      embed.setFooter({ text: `Showing 5 of ${total} elections` });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Elections error:", error);
    await interaction.editReply({ content: errorMessage(error) });
  }
}
