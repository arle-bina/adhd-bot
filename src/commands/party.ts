import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getParty } from "../utils/api.js";
import { hexToInt, replyWithError, standardFooter } from "../utils/helpers.js";
import { currencyFor, formatCurrency } from "../utils/currency.js";

export function ideologyLabel(economic: number, social: number): string {
  const econ = economic < -20 ? "Left" : economic > 20 ? "Right" : "Center";
  const soc = social < -20 ? "Liberal" : social > 20 ? "Conservative" : "Center";
  if (econ === "Center" && soc === "Center") return "Centrist";
  if (soc === "Center") return econ;
  if (econ === "Center") return soc;
  return `${econ}-${soc}`;
}

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("party")
  .setDescription("Look up a political party")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription("Party ID number (e.g. 1, 2, 3)")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("country")
      .setDescription("Country code (e.g. US, UK, JP)")
      .setRequired(true)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" },
        { name: "Japan", value: "JP" },
        { name: "Canada", value: "CA" },
        { name: "Germany", value: "DE" },
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString("id", true);
  const country = interaction.options.getString("country", true);

  await interaction.deferReply();

  try {
    const result = await getParty(id, country);

    if (!result.found || !result.party) {
      await interaction.editReply({
        content: "Party not found. Use the party ID number (e.g. `1`, `2`) with the correct country.",
      });
      return;
    }

    const party = result.party;

    const topMembersValue =
      party.topMembers
        .slice(0, 5)
        .map((m, i) => `${i + 1}. ${m.name} — ${m.position}`)
        .join("\n") || "None";

    const embed = new EmbedBuilder()
      .setTitle(`[${party.abbreviation}] ${party.name}`)
      .setURL(party.partyUrl)
      .setColor(hexToInt(party.color))
      .addFields(
        { name: "Chair", value: party.chairName ?? "Vacant", inline: true },
        { name: "Members", value: party.memberCount.toLocaleString(), inline: true },
        { name: "Treasury", value: formatCurrency(party.treasury, currencyFor(country)), inline: true },
        {
          name: "Ideology",
          value: ideologyLabel(party.economicPosition, party.socialPosition),
          inline: true,
        },
        { name: "Top Members", value: topMembersValue }
      )
      .setFooter(standardFooter("Try /party-compare for side-by-side"));

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "party", error);
  }
}
