import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getGovernment } from "../utils/api.js";
import { replyWithError, standardFooter, hexToInt } from "../utils/helpers.js";

const COUNTRY_FLAGS: Record<string, string> = {
  US: "🇺🇸",
  UK: "🇬🇧",
  CA: "🇨🇦",
  DE: "🇩🇪",
};

const COUNTRY_COLORS: Record<string, number> = {
  US: 0x3c3b6e, // navy blue
  UK: 0xc8102e, // union red
  CA: 0xff0000, // maple red
  DE: 0xffcc00, // gold
};

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("country")
  .setDescription("View a country's government — head of state, leadership, and cabinet")
  .addStringOption((option) =>
    option
      .setName("country")
      .setDescription("Country to look up")
      .setRequired(false)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" },
        { name: "Canada", value: "CA" },
        { name: "Germany", value: "DE" },
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const country = interaction.options.getString("country") ?? "US";

  await interaction.deferReply();

  try {
    const result = await getGovernment(country);

    if (!result.found || result.officials.length === 0) {
      await interaction.editReply({
        content: `No government data found for **${country}**.`,
      });
      return;
    }

    const flag = COUNTRY_FLAGS[result.country] ?? "🏛️";
    const color = COUNTRY_COLORS[result.country] ?? 0x5865f2;

    const embed = new EmbedBuilder()
      .setTitle(`${flag} ${result.countryName} — Government`)
      .setColor(color);

    // Group officials by section
    const executives = result.officials.filter((o) => o.section === "executive");
    const leadership = result.officials.filter((o) => o.section === "leadership");
    const cabinet = result.officials.filter((o) => o.section === "cabinet");

    if (executives.length > 0) {
      const value = executives
        .map((o) => {
          const name = o.characterName
            ? (o.profileUrl ? `[${o.characterName}](${o.profileUrl})` : o.characterName)
              + (o.isNPP ? " [NPC]" : "")
              + ` (${o.party ?? "Independent"})`
            : "Vacant";
          return `**${o.role}:** ${name}`;
        })
        .join("\n");
      embed.addFields({ name: "Executive", value: value.slice(0, 1024) });
    }

    if (leadership.length > 0) {
      const value = leadership
        .map((o) => {
          const name = o.characterName
            ? (o.profileUrl ? `[${o.characterName}](${o.profileUrl})` : o.characterName)
              + ` (${o.party ?? "Independent"})`
            : "Vacant";
          return `**${o.role}:** ${name}`;
        })
        .join("\n");
      embed.addFields({ name: "Congressional Leadership", value: value.slice(0, 1024) });
    }

    if (cabinet.length > 0) {
      const value = cabinet
        .map((o) => {
          const name = o.characterName
            ? (o.profileUrl ? `[${o.characterName}](${o.profileUrl})` : o.characterName)
              + ` (${o.party ?? "Independent"})`
            : "Vacant";
          return `**${o.role}:** ${name}`;
        })
        .join("\n");
      embed.addFields({ name: "Cabinet", value: value.slice(0, 1024) });
    }

    embed.setFooter(standardFooter());

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "country", error);
  }
}
