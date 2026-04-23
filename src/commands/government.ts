import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getGovernment, type GovernmentOfficial, type GovernmentFormationData } from "../utils/api.js";
import { hexToInt, replyWithError, standardFooter } from "../utils/helpers.js";
import { COUNTRY_FLAG } from "../utils/formatting.js";

export const cooldown = 5;

function sectionTitle(section: string, country: string): string {
  if (section === "leadership") {
    if (country === "UK" || country === "CA") return "Parliamentary Leadership";
    if (country === "DE") return "Bundestag Leadership";
    if (country === "JP") return "Diet Leadership";
    return "Congressional Leadership";
  }
  if (section === "cabinet") {
    if (country === "UK") return "Government Cabinet";
    if (country === "JP") return "Naikaku";
    if (country === "DE") return "Bundeskabinett";
    return "Cabinet";
  }
  return "Executive";
}

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
        { name: "Japan", value: "JP" },
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

    // Government formation section for parliamentary countries
    if (result.governmentFormation) {
      const lines = buildFormationLines(result.governmentFormation, result.country);
      if (lines.length > 0) {
        embed.addFields({
          name: "🏛️ Government Formation",
          value: lines.join("\n").slice(0, 1024),
          inline: false,
        });
      }
    }

    for (const [section, officials] of sections) {
      const title = sectionTitle(section, result.country);
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

const FORMATION_STATUS_EMOJI: Record<string, string> = {
  formed: "✅",
  pending: "⏳",
  collapsed: "❌",
};

const FORMATION_TYPE_LABEL: Record<string, string> = {
  majority: "Majority",
  coalition: "Coalition",
  minority: "Minority",
  admin: "Admin",
};

function buildFormationLines(gf: GovernmentFormationData, country: string): string[] {
  const lines: string[] = [];

  // Status line
  const statusEmoji = FORMATION_STATUS_EMOJI[gf.status] ?? "❓";
  const statusLabel = gf.status.charAt(0).toUpperCase() + gf.status.slice(1);
  const typeLabel = gf.formationType
    ? FORMATION_TYPE_LABEL[gf.formationType] ?? gf.formationType
    : null;
  lines.push(
    `**Status:** ${statusEmoji} ${statusLabel}${typeLabel ? ` (${typeLabel})` : ""}`
  );

  // PM line
  if (gf.pmName) {
    lines.push(`**Prime Minister:** ${gf.pmName}`);
  } else if (gf.status === "pending") {
    lines.push(`**Prime Minister:** None — appointment pending`);
  }

  // Seat support line
  lines.push(
    `**Seat Support:** ${gf.totalSeatsSupporting}/${gf.majorityThreshold} needed for majority`
  );

  // Active vote alert
  if (gf.activeVoteId) {
    lines.push(`⚠️ **Active vote in progress**`);
  }

  // PM vacancy deadline
  if (gf.pmVacancyDeadlineTurn != null) {
    lines.push(
      `🔴 **Auto snap election** at turn ${gf.pmVacancyDeadlineTurn} if no PM seated`
    );
  }

  // Seat breakdown — compact inline format using party names
  const partySeats = Object.entries(gf.seatsByPartyNames)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8); // limit to top 8 parties
  if (partySeats.length > 0) {
    const seatStr = partySeats
      .map(([name, seats]) => `${name}: ${seats}`)
      .join(" · ");
    const overflow = Object.keys(gf.seatsByPartyNames).length - partySeats.length;
    const suffix = overflow > 0 ? ` +${overflow} more` : "";
    lines.push(`**Seats:** ${seatStr}${suffix} (Total: ${gf.totalSeats})`);
  }

  // Coalition parties (if coalition government)
  if (gf.coalitionPartyNames && gf.coalitionPartyNames.length > 1) {
    lines.push(`**Coalition:** ${gf.coalitionPartyNames.join(", ")}`);
  } else if (gf.governingPartyName) {
    lines.push(`**Governing Party:** ${gf.governingPartyName}`);
  }

  return lines;
}
