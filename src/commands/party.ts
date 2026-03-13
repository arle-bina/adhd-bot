import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getParty } from "../utils/api.js";
import { hexToInt, logCommandError } from "../utils/helpers.js";

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
      .setDescription("Party ID/slug (e.g. democrat, republican, labour)")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString("id", true);

  await interaction.deferReply();

  try {
    const result = await getParty(id);

    if (!result.found || !result.party) {
      await interaction.editReply({
        content: "Party not found. Try the slug, e.g. `democrat`, `republican`, `labour`.",
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
        { name: "Treasury", value: `$${party.treasury.toLocaleString()}`, inline: true },
        {
          name: "Ideology",
          value: ideologyLabel(party.economicPosition, party.socialPosition),
          inline: true,
        },
        { name: "Top Members", value: topMembersValue }
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content: logCommandError("party", error) });
  }
}
