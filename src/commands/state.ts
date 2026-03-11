import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getState } from "../utils/api.js";
import { errorMessage } from "../utils/helpers.js";

function formatOfficeType(type: string): string {
  const map: Record<string, string> = {
    governor: "Governor",
    senate: "Senator",
    house: "Representative",
    stateSenate: "State Senator",
    commons: "MP",
    primeMinister: "Prime Minister",
  };
  return map[type] ?? type;
}

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("state")
  .setDescription("Look up a state or region")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription("State/region code (e.g. CA, TX, NY, UK_ENG)")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString("id", true);

  await interaction.deferReply();

  try {
    const result = await getState(id);

    if (!result.found || !result.state) {
      await interaction.editReply({
        content: "State not found. Use the state code, e.g. `CA`, `TX`, `UK_ENG`.",
      });
      return;
    }

    const s = result.state;

    const officialsValue =
      s.officials
        .map((o) => {
          const officeLabel = formatOfficeType(o.officeType);
          const nameStr = o.characterName
            ? `${o.characterName}${o.isNPP ? " [NPC]" : ""} (${o.party ?? "Independent"})`
            : "Vacant";
          return `**${officeLabel}:** ${nameStr}`;
        })
        .join("\n") || "None";

    const embed = new EmbedBuilder()
      .setTitle(`🏛️ ${s.name}`)
      .setURL(s.stateUrl)
      .setColor(0x57f287)
      .addFields(
        { name: "Region", value: s.region, inline: true },
        { name: "Population", value: s.population.toLocaleString(), inline: true },
        {
          name: "Voting System",
          value: s.votingSystem === "rcv" ? "Ranked Choice" : "First Past the Post",
          inline: true,
        },
        { name: "Officials", value: officialsValue.slice(0, 1024) }
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("State error:", error);
    await interaction.editReply({ content: errorMessage(error) });
  }
}
