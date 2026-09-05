import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from "discord.js";
import { getGovernment, type GovernmentOfficial, type GovernmentFormationData } from "../utils/api.js";
import { hexToInt, replyWithError, standardFooter } from "../utils/helpers.js";
import { renderComposition, seriesColor, type CompositionSegment } from "../utils/viz/index.js";
import { chartAttachment } from "../utils/viz/attach.js";
import { COUNTRY_FLAG } from "../utils/formatting.js";
import { respondCountryAutocomplete, validateCountry } from "../utils/countryChoices.js";

export const cooldown = 5;

function sectionTitle(section: string, country: string): string {
  if (section === "leadership") {
    if (country === "UK") return "Parliamentary Leadership";
    if (country === "DE") return "Bundestag Leadership";
    if (country === "JP") return "Diet Leadership";
    if (country === "IE") return "Oireachtas Leadership";
    if (country === "CN") return "NPC Leadership";
    return "Congressional Leadership";
  }
  if (section === "cabinet") {
    if (country === "UK") return "Government Cabinet";
    if (country === "JP") return "Naikaku";
    if (country === "DE") return "Bundeskabinett";
    if (country === "IE") return "Government";
    if (country === "CN") return "State Council";
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
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await respondCountryAutocomplete(interaction);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const country = interaction.options.getString("country") ?? undefined;

  await interaction.deferReply();

  /*
   * Autocomplete does not constrain submitted values the way choices did, so
   * re-check here. Runs AFTER deferReply: a cold country cache makes an HTTP
   * call (60s client timeout) and Discord kills an un-acknowledged interaction
   * after 3s.
   */
  const check = await validateCountry(country ?? null);
  if (!check.ok) {
    await interaction.editReply({ content: check.message });
    return;
  }

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

    // A coalition's only real question is whether it clears the line, so the
    // chart is a composition bar against the majority threshold — not a pie,
    // which answers "what share" instead.
    const chart = result.governmentFormation
      ? buildSupportChart(result.governmentFormation, result.countryName)
      : null;
    const attachment = chart ? chartAttachment(chart, "government", result.country) : null;
    if (attachment) embed.setImage(attachment.url);

    await interaction.editReply({ embeds: [embed], files: attachment ? [attachment.file] : [] });
  } catch (error) {
    await replyWithError(interaction, "government", error);
  }
}

/**
 * The governing bloc against the majority threshold.
 *
 * Coalition partners are drawn in seat order and named; everything not
 * supporting the government falls into the remainder segment, so the bar always
 * sums to the chamber.
 */
function buildSupportChart(gf: GovernmentFormationData, countryName: string): Buffer | null {
  const total = gf.totalSeats;
  if (!total || total <= 0) return null;

  const supporters = Object.entries(gf.seatsByPartyNames ?? {})
    .filter(([, seats]) => seats > 0)
    .sort((a, b) => b[1] - a[1]);
  if (supporters.length === 0) return null;

  const segments: CompositionSegment[] = supporters.map(([name, seats], i) => ({
    label: name,
    value: seats,
    color: seriesColor(i),
  }));

  const typeLabel = gf.formationType ? FORMATION_TYPE_LABEL[gf.formationType] ?? gf.formationType : null;
  const statusLabel = gf.status.charAt(0).toUpperCase() + gf.status.slice(1);

  return renderComposition({
    title: `${countryName} — government support`,
    subtitle: [typeLabel, statusLabel, gf.pmName ? `PM ${gf.pmName}` : null].filter(Boolean).join(" · "),
    footerLeft: `${gf.totalSeatsSupporting} of ${total} seats supporting`,
    segments,
    total,
    threshold: gf.majorityThreshold || undefined,
    thresholdLabel: "Majority",
    unit: "seats",
    remainderLabel: "Not supporting",
  });
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

function buildFormationLines(gf: GovernmentFormationData, _country: string): string[] {
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
