import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getParty } from "../utils/api.js";
import { hexToInt, replyWithError, positionBar } from "../utils/helpers.js";
import { currencyFor, formatCurrency } from "../utils/currency.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("party-compare")
  .setDescription("Compare two political parties side by side")
  .addStringOption((o) =>
    o.setName("party1").setDescription("First party slug (e.g. labour, republican)").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("country1").setDescription("Country for the first party").setRequired(true)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" },
        { name: "Japan", value: "JP" },
        { name: "Canada", value: "CA" },
        { name: "Germany", value: "DE" }
      )
  )
  .addStringOption((o) =>
    o.setName("party2").setDescription("Second party slug (e.g. labour, republican)").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("country2").setDescription("Country for the second party").setRequired(true)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" },
        { name: "Japan", value: "JP" },
        { name: "Canada", value: "CA" },
        { name: "Germany", value: "DE" }
      )
  );

function ideologyLabel(economic: number, social: number): string {
  const econ = economic > 15 ? "Left" : economic < -15 ? "Right" : "Centre";
  const soc = social > 15 ? "Liberal" : social < -15 ? "Conservative" : "Moderate";
  if (econ === "Centre" && soc === "Moderate") return "Centrist";
  return `${econ}-${soc}`;
}


export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const slug1 = interaction.options.getString("party1", true);
  const country1 = interaction.options.getString("country1", true);
  const slug2 = interaction.options.getString("party2", true);
  const country2 = interaction.options.getString("country2", true);

  await interaction.deferReply();

  try {
    const [res1, res2] = await Promise.all([
      getParty(slug1, country1),
      getParty(slug2, country2),
    ]);

    if (!res1.found || !res1.party) {
      await interaction.editReply({ content: `Party "${slug1}" not found in ${country1}.` });
      return;
    }
    if (!res2.found || !res2.party) {
      await interaction.editReply({ content: `Party "${slug2}" not found in ${country2}.` });
      return;
    }

    const p1 = res1.party;
    const p2 = res2.party;

    // Blend colors for embed: use the first party's color
    const color = hexToInt(p1.color);

    const embed = new EmbedBuilder()
      .setTitle(`${p1.name} vs ${p2.name}`.slice(0, 256))
      .setColor(color)
      .setFooter({ text: "ahousedividedgame.com" });

    // Header row
    embed.addFields(
      { name: "Party", value: p1.partyUrl ? `[${p1.name}](${p1.partyUrl})` : p1.name, inline: true },
      { name: "\u200b", value: "vs", inline: true },
      { name: "\u200b", value: p2.partyUrl ? `[${p2.name}](${p2.partyUrl})` : p2.name, inline: true },
      { name: "Abbreviation", value: p1.abbreviation || "—", inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "\u200b", value: p2.abbreviation || "—", inline: true },
      { name: "Members", value: (p1.memberCount ?? 0).toLocaleString(), inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "\u200b", value: (p2.memberCount ?? 0).toLocaleString(), inline: true },
      { name: "Treasury", value: formatCurrency(p1.treasury ?? 0, currencyFor(country1)), inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "\u200b", value: formatCurrency(p2.treasury ?? 0, currencyFor(country2)), inline: true },
      { name: "Chair", value: p1.chairName ?? "Vacant", inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "\u200b", value: p2.chairName ?? "Vacant", inline: true },
    );

    // Ideology section
    const ideologyLines = [
      `**${p1.name}** — ${ideologyLabel(p1.economicPosition, p1.socialPosition)}`,
      `Economic: \`${positionBar(p1.economicPosition)}\` (${p1.economicPosition > 0 ? "+" : ""}${Math.round(p1.economicPosition)})`,
      `Social:   \`${positionBar(p1.socialPosition)}\` (${p1.socialPosition > 0 ? "+" : ""}${Math.round(p1.socialPosition)})`,
      "",
      `**${p2.name}** — ${ideologyLabel(p2.economicPosition, p2.socialPosition)}`,
      `Economic: \`${positionBar(p2.economicPosition)}\` (${p2.economicPosition > 0 ? "+" : ""}${Math.round(p2.economicPosition)})`,
      `Social:   \`${positionBar(p2.socialPosition)}\` (${p2.socialPosition > 0 ? "+" : ""}${Math.round(p2.socialPosition)})`,
    ];

    embed.addFields({
      name: "Ideology",
      value: ideologyLines.join("\n").slice(0, 1024),
      inline: false,
    });

    // Top members per party (up to 3 each)
    const memberSection: string[] = [];
    if (p1.topMembers.length > 0) {
      memberSection.push(`**${p1.name}** top members:`);
      for (const m of p1.topMembers.slice(0, 3)) {
        const link = m.profileUrl ? `[${m.name}](${m.profileUrl})` : m.name;
        memberSection.push(`${link} — ${m.position} · PI: ${Math.round(m.politicalInfluence).toLocaleString()}`);
      }
    }
    if (p2.topMembers.length > 0) {
      if (memberSection.length > 0) memberSection.push("");
      memberSection.push(`**${p2.name}** top members:`);
      for (const m of p2.topMembers.slice(0, 3)) {
        const link = m.profileUrl ? `[${m.name}](${m.profileUrl})` : m.name;
        memberSection.push(`${link} — ${m.position} · PI: ${Math.round(m.politicalInfluence).toLocaleString()}`);
      }
    }
    if (memberSection.length > 0) {
      embed.addFields({
        name: "Top Members",
        value: memberSection.join("\n").slice(0, 1024),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "party-compare", error);
  }
}
