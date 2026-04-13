import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from "discord.js";
import { getState, getAutocomplete } from "../utils/api.js";
import { replyWithError, standardFooter } from "../utils/helpers.js";

export function formatOfficeType(type: string): string {
  const map: Record<string, string> = {
    governor: "Governor",
    senate: "Senator",
    house: "Representative",
    stateSenate: "State Senator",
    commons: "MP",
    primeMinister: "Prime Minister",
    shugiin: "Representative",
    sangiin: "Councillor",
    bundestag: "MdB",
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
      .setDescription("State or region")
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  try {
    const res = await getAutocomplete({ type: "states", q: focused, limit: 25 });
    await interaction.respond(
      res.results.map((r) => ({ name: r.name, value: r.id }))
    );
  } catch {
    await interaction.respond([]);
  }
}

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
          if (!o.characterName) return `**${officeLabel}:** Vacant`;
          const npcSuffix = o.isNPP ? " [NPC]" : "";
          const display = `${o.characterName}${npcSuffix} (${o.party ?? "Independent"})`;
          const nameStr = o.profileUrl ? `[${display}](${o.profileUrl})` : display;
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
      )
      .setFooter(standardFooter("Try /elections state:<code> for this state's races"));

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "state", error);
  }
}
