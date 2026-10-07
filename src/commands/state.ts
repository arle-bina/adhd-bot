import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from "discord.js";
import { getState, getAutocomplete } from "../utils/api.js";
import { replyWithError, standardFooter, normalizeGameUrl } from "../utils/helpers.js";
import { stateDidYouMean } from "../utils/lookupSuggestions.js";
import { formatOfficeType } from "../utils/formatting.js";

export { formatOfficeType };

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("state")
  .setDescription("Look up a state or region")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription("State or region: type a name or code (e.g. CA, UK_ENG)")
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
        content:
          "State not found. Pick one from the suggestions as you type, or use the state code, e.g. `CA`, `TX`, `UK_ENG`." +
          (await stateDidYouMean(id)),
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
          const nameStr = o.profileUrl ? `[${display}](${normalizeGameUrl(o.profileUrl)})` : display;
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
