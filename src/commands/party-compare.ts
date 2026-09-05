import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from "discord.js";
import { getParty } from "../utils/api.js";
import { hexToInt, replyWithError, positionBar } from "../utils/helpers.js";
import { currencyFor } from "../utils/currency.js";
import { renderVersus, compactMoney, compactNumber, type VersusMetric } from "../utils/viz/index.js";
import { chartAttachment } from "../utils/viz/attach.js";
import { subtext, meta } from "../utils/embeds.js";
import { symbolFor } from "../utils/currency.js";
import { respondCountryAutocomplete, validateCountry } from "../utils/countryChoices.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("party-compare")
  .setDescription("Compare two political parties side by side")
  .addStringOption((o) =>
    o.setName("party1").setDescription("First party ID number (e.g. 1, 2, 3)").setRequired(true)
  )
  .addStringOption((o) =>
    o
      .setName("country1")
      .setDescription("Country for the first party")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName("party2").setDescription("Second party ID number (e.g. 1, 2, 3)").setRequired(true)
  )
  .addStringOption((o) =>
    o
      .setName("country2")
      .setDescription("Country for the second party")
      .setRequired(true)
      .setAutocomplete(true)
  );

// Both country options want the same suggestions, so no per-option branching.
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await respondCountryAutocomplete(interaction);
}

function ideologyLabel(economic: number, social: number): string {
  const econ = economic < -1 ? "Left" : economic > 1 ? "Right" : "Center";
  const soc = social < -1 ? "Liberal" : social > 1 ? "Conservative" : "Center";
  if (econ === "Center" && soc === "Center") return "Centrist";
  if (soc === "Center") return econ;
  if (econ === "Center") return soc;
  return `${econ}-${soc}`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const id1 = interaction.options.getString("party1", true);
  const country1 = interaction.options.getString("country1", true);
  const id2 = interaction.options.getString("party2", true);
  const country2 = interaction.options.getString("country2", true);

  await interaction.deferReply();

  /*
   * Autocomplete does not constrain submitted values the way choices did, so
   * re-check here. Runs AFTER deferReply: a cold country cache makes an HTTP
   * call (60s client timeout) and Discord kills an un-acknowledged interaction
   * after 3s.
   */
  for (const code of [country1, country2]) {
    const check = await validateCountry(code);
    if (!check.ok) {
      await interaction.editReply({ content: check.message });
      return;
    }
  }

  try {
    const [res1, res2] = await Promise.all([
      getParty(id1, country1),
      getParty(id2, country2),
    ]);

    if (!res1.found || !res1.party) {
      await interaction.editReply({ content: `Party "${id1}" not found in ${country1}.` });
      return;
    }
    if (!res2.found || !res2.party) {
      await interaction.editReply({ content: `Party "${id2}" not found in ${country2}.` });
      return;
    }

    const p1 = res1.party;
    const p2 = res2.party;

    // Blend colors for embed: use the first party's color
    const color = hexToInt(p1.color);

    /*
     * Head-to-head bars.
     *
     * Ideology is deliberately absent: "further left" is not "ahead", and a
     * diverging bar implies a winner. Positions stay in the embed's ideology
     * section, where a direction reads as a direction.
     *
     * Treasuries are compared in each party's own currency because the two can
     * sit in different countries; the card says which, rather than silently
     * converting one into the other's.
     */
    const cc1 = currencyFor(country1);
    const cc2 = currencyFor(country2);
    const metrics: VersusMetric[] = [
      {
        label: "Members",
        left: p1.memberCount ?? 0,
        right: p2.memberCount ?? 0,
        leftDisplay: compactNumber(p1.memberCount ?? 0),
        rightDisplay: compactNumber(p2.memberCount ?? 0),
      },
      {
        label: "Treasury",
        left: Math.max(0, p1.treasury ?? 0),
        right: Math.max(0, p2.treasury ?? 0),
        leftDisplay: compactMoney(p1.treasury ?? 0, symbolFor(cc1)),
        rightDisplay: compactMoney(p2.treasury ?? 0, symbolFor(cc2)),
        // Different currencies; the bar lengths are not a like-for-like
        // comparison, so neither side is marked as leading.
        neutral: cc1 !== cc2,
      },
      {
        label: "Top-member influence",
        left: p1.topMembers.reduce((sum, m) => sum + (m.politicalInfluence ?? 0), 0),
        right: p2.topMembers.reduce((sum, m) => sum + (m.politicalInfluence ?? 0), 0),
        leftDisplay: compactNumber(p1.topMembers.reduce((sum, m) => sum + (m.politicalInfluence ?? 0), 0)),
        rightDisplay: compactNumber(p2.topMembers.reduce((sum, m) => sum + (m.politicalInfluence ?? 0), 0)),
      },
    ];

    const chart = chartAttachment(
      renderVersus({
        title: `${p1.name} vs ${p2.name}`,
        subtitle: cc1 === cc2 ? "Each metric scaled to its own pair" : `Treasuries in ${cc1} and ${cc2} — not directly comparable`,
        footerLeft: `${p1.abbreviation || p1.name} · ${p2.abbreviation || p2.name}`,
        left: { name: p1.name, detail: ideologyLabel(p1.economicPosition, p1.socialPosition), color: p1.color },
        right: { name: p2.name, detail: ideologyLabel(p2.economicPosition, p2.socialPosition), color: p2.color },
        metrics,
      }),
      "party-compare",
      `${p1.id}-${p2.id}`,
    );

    const embed = new EmbedBuilder()
      .setTitle(`${p1.name} vs ${p2.name}`.slice(0, 256))
      .setColor(color)
      .setFooter({ text: "ahousedividedgame.com" });

    /*
     * The chart draws members, treasury and top-member influence for both sides,
     * so the fifteen paired inline fields that used to sit here are gone. Discord
     * reflowed them into an unreadable grid on mobile anyway. What survives is
     * the two links and the facts the chart has no row for.
     */
    embed.setDescription(
      [
        `${p1.partyUrl ? `[${p1.name}](${p1.partyUrl})` : p1.name}` +
          ` **vs** ` +
          `${p2.partyUrl ? `[${p2.name}](${p2.partyUrl})` : p2.name}`,
        subtext(
          meta(
            `${p1.abbreviation || "—"} chair ${p1.chairName ?? "vacant"}`,
            `${p2.abbreviation || "—"} chair ${p2.chairName ?? "vacant"}`,
          ),
        ),
      ].join("\n"),
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

    embed.setImage(chart.url);
    await interaction.editReply({ embeds: [embed], files: [chart.file] });
  } catch (error) {
    await replyWithError(interaction, "party-compare", error);
  }
}
