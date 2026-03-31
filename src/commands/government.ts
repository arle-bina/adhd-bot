import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getGovernment, type GovernmentOfficial } from "../utils/api.js";
import { hexToInt, replyWithError, standardFooter } from "../utils/helpers.js";

export const cooldown = 5;

const SECTION_TITLES: Record<string, string> = {
  executive: "Executive",
  leadership: "Congressional Leadership",
  cabinet: "Cabinet",
};

const COUNTRY_FLAG: Record<string, string> = {
  US: "🇺🇸",
  UK: "🇬🇧",
  CA: "🇨🇦",
  DE: "🇩🇪",
};

export const data = new SlashCommandBuilder()
  .setName("government")
  .setDescription("View the current government of a country")
  .addStringOption((o) =>
    o
      .setName("country")
      .setDescription("Country")
      .setRequired(false)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" },
        { name: "Canada", value: "CA" },
        { name: "Germany", value: "DE" },
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const country = interaction.options.getString("country") ?? undefined;

  await interaction.deferReply();

  try {
    const result = await getGovernment(country);

    if (!result.found || result.officials.length === 0) {
      await interaction.editReply({ content: "No government data found." });
      return;
    }

    const flag = COUNTRY_FLAG[result.country] ?? "🏛️";

    // Group officials by section, preserving API order within each section
    const sections = new Map<string, GovernmentOfficial[]>();
    for (const official of result.officials) {
      const group = sections.get(official.section) ?? [];
      group.push(official);
      sections.set(official.section, group);
    }

    // Determine embed color from the head of state's party
    const headOfState = result.officials.find((o) => o.section === "executive");
    const embedColor = headOfState ? hexToInt(headOfState.partyColor) : 0x5865f2;

    const embed = new EmbedBuilder()
      .setTitle(`${flag} Government of ${result.countryName}`)
      .setColor(embedColor)
      .setFooter(standardFooter());

    for (const [section, officials] of sections) {
      const title = SECTION_TITLES[section] ?? section;
      const lines = officials.map((o) => {
        const npp = o.isNPP ? " [NPC]" : "";
        if (!o.characterName) {
          return `**${o.role}:** Vacant`;
        }
        const nameStr = o.profileUrl
          ? `[${o.characterName}](${o.profileUrl})${npp}`
          : `${o.characterName}${npp}`;
        const partyStr = o.party ? ` (${o.party})` : "";
        return `**${o.role}:** ${nameStr}${partyStr}`;
      });

      embed.addFields({
        name: title,
        value: lines.join("\n").slice(0, 1024),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "government", error);
  }
}
