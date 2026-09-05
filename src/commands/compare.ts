import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from "discord.js";
import { lookupByName, lookupByDiscordId, getAutocomplete, type CharacterResult } from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";
import { currencyFor, formatCurrency, convertCurrency, fetchForexRates, symbolFor, CURRENCY_CHOICES, CURRENCY_SYMBOLS } from "../utils/currency.js";
import { renderVersus, compactMoney, compactNumber, type VersusMetric } from "../utils/viz/index.js";
import { chartAttachment } from "../utils/viz/attach.js";
import { subtext, meta } from "../utils/embeds.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("compare")
  .setDescription("Compare two politicians side by side")
  .addStringOption((o) =>
    o.setName("politician1").setDescription("First character name").setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName("politician2").setDescription("Second character name").setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o
      .setName("currency")
      .setDescription("Display currency (default: first character's home currency)")
      .setRequired(false)
      .addChoices(...CURRENCY_CHOICES)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  try {
    const res = await getAutocomplete({ type: "characters", q: focused, limit: 25 });
    await interaction.respond(
      res.results.map((r) => ({ name: r.name, value: r.name }))
    );
  } catch {
    await interaction.respond([]);
  }
}

function policyLabel(val: number): string {
  const clamped = Math.round(Math.max(-100, Math.min(100, val)));
  const dir = clamped > 10 ? "Left" : clamped < -10 ? "Right" : "Centre";
  return `${dir} (${clamped > 0 ? "+" : ""}${clamped})`;
}

function statRow(label: string, a: string, b: string): string {
  return `**${label}**\n${a} vs ${b}`;
}

function makeForexFooter(displayCurrency: string, rates: Record<string, number>): string {
  const parts: string[] = [];
  if (displayCurrency !== "USD" && rates[displayCurrency] && rates[displayCurrency] !== 1) {
    const sym = CURRENCY_SYMBOLS[displayCurrency] ?? displayCurrency;
    const rateVal = displayCurrency === "JPY" ? rates[displayCurrency].toFixed(2) : rates[displayCurrency].toFixed(4);
    parts.push(`1 INT = ${sym}${rateVal} ${displayCurrency}`);
  }
  parts.push("ahousedividedgame.com");
  return parts.join(" · ");
}

/**
 * Head-to-head bars.
 *
 * "12,480 vs 11,020" makes the reader do the division; two bars off a shared
 * centre make the gap a length. Every metric is scaled to its own pair, since
 * an influence count and an approval percentage share no axis.
 *
 * Policy positions are deliberately excluded: "further left" is not "ahead",
 * and a bar implies a winner. Those stay in the embed text.
 */
function buildCompareChart(
  a: CharacterResult,
  b: CharacterResult,
  displayCurrency: string,
  rates: Record<string, number>,
): Buffer {
  const sym = symbolFor(displayCurrency);
  const cvtA = (n: number) => convertCurrency(n, currencyFor(a.countryId), displayCurrency, rates);
  const cvtB = (n: number) => convertCurrency(n, currencyFor(b.countryId), displayCurrency, rates);

  const metrics: VersusMetric[] = [
    {
      label: "Political influence",
      left: Math.round(a.politicalInfluence ?? 0),
      right: Math.round(b.politicalInfluence ?? 0),
      leftDisplay: compactNumber(Math.round(a.politicalInfluence ?? 0)),
      rightDisplay: compactNumber(Math.round(b.politicalInfluence ?? 0)),
    },
    {
      label: "National influence",
      left: Math.round(a.nationalInfluence ?? 0),
      right: Math.round(b.nationalInfluence ?? 0),
      leftDisplay: compactNumber(Math.round(a.nationalInfluence ?? 0)),
      rightDisplay: compactNumber(Math.round(b.nationalInfluence ?? 0)),
    },
    {
      label: "Approval",
      left: Math.round(a.favorability ?? 0),
      right: Math.round(b.favorability ?? 0),
      leftDisplay: `${Math.round(a.favorability ?? 0)}%`,
      rightDisplay: `${Math.round(b.favorability ?? 0)}%`,
    },
    {
      label: "Infamy",
      left: Math.round(a.infamy ?? 0),
      right: Math.round(b.infamy ?? 0),
      leftDisplay: String(Math.round(a.infamy ?? 0)),
      rightDisplay: String(Math.round(b.infamy ?? 0)),
      // A clean record is the better one, so the smaller bar leads here.
      lowerIsBetter: true,
    },
    {
      label: "Funds",
      left: Math.max(0, cvtA(a.funds ?? 0)),
      right: Math.max(0, cvtB(b.funds ?? 0)),
      leftDisplay: compactMoney(cvtA(a.funds ?? 0), sym),
      rightDisplay: compactMoney(cvtB(b.funds ?? 0), sym),
    },
    {
      label: "Actions",
      left: Math.round(a.actions ?? 0),
      right: Math.round(b.actions ?? 0),
      leftDisplay: String(Math.round(a.actions ?? 0)),
      rightDisplay: String(Math.round(b.actions ?? 0)),
    },
    {
      label: "Donor base",
      left: Math.round(a.donorBaseLevel ?? 0),
      right: Math.round(b.donorBaseLevel ?? 0),
      leftDisplay: String(Math.round(a.donorBaseLevel ?? 0)),
      rightDisplay: String(Math.round(b.donorBaseLevel ?? 0)),
    },
  ];

  return renderVersus({
    title: `${a.name} vs ${b.name}`,
    subtitle: "Each metric scaled to its own pair",
    footerLeft: `Values ${displayCurrency}`,
    left: { name: a.name, detail: [a.position, a.party].filter(Boolean).join(" · "), color: a.partyColor },
    right: { name: b.name, detail: [b.position, b.party].filter(Boolean).join(" · "), color: b.partyColor },
    metrics,
  });
}

function buildCompareEmbed(a: CharacterResult, b: CharacterResult, displayCurrency: string, rates: Record<string, number>): EmbedBuilder {
  const colorA = hexToInt(a.partyColor);
  const colorB = hexToInt(b.partyColor);
  const color = colorA !== 0x5865f2 ? colorA : colorB;

  const nameA = a.profileUrl ? `[${a.name}](${a.profileUrl})` : a.name;
  const nameB = b.profileUrl ? `[${b.name}](${b.profileUrl})` : b.name;

  const cvtA = (n: number) => Math.round(convertCurrency(n, currencyFor(a.countryId), displayCurrency, rates));
  const cvtB = (n: number) => Math.round(convertCurrency(n, currencyFor(b.countryId), displayCurrency, rates));

  const embed = new EmbedBuilder()
    .setTitle(`⚖️ ${a.name} vs ${b.name}`.slice(0, 256))
    .setColor(color)
    .setFooter({ text: makeForexFooter(displayCurrency, rates) });

  /*
   * The card draws both sides' office and party under their names, and every
   * stat as a bar. These twelve paired inline fields were the same facts a
   * second time, reflowed by Discord into an unreadable grid on mobile. Only
   * the links survive.
   */
  const sideLinks = (c: CharacterResult, name: string) =>
    meta(
      name,
      c.partyUrl ? `[${c.party}](${c.partyUrl})` : c.party || null,
      c.stateUrl ? `[${c.state}](${c.stateUrl})` : c.state || null,
    );


  embed.setDescription(
    [
      sideLinks(a, nameA),
      "**vs**",
      sideLinks(b, nameB),
      // One-line text equivalent of the chart, for images-off and screen readers.
      subtext(
        meta(
          `PI ${Math.round(a.politicalInfluence ?? 0).toLocaleString()} vs ${Math.round(b.politicalInfluence ?? 0).toLocaleString()}`,
          `Approval ${Math.round(a.favorability ?? 0)}% vs ${Math.round(b.favorability ?? 0)}%`,
          `Funds ${formatCurrency(cvtA(a.funds ?? 0), displayCurrency)} vs ${formatCurrency(cvtB(b.funds ?? 0), displayCurrency)}`,
        ),
      ),
    ].join("\n"),
  );

  const policyLines = [
    statRow("Economic", policyLabel(a.policies?.economic ?? 0), policyLabel(b.policies?.economic ?? 0)),
    statRow("Social", policyLabel(a.policies?.social ?? 0), policyLabel(b.policies?.social ?? 0)),
  ];
  embed.addFields({ name: "Policy Positions", value: policyLines.join("\n").slice(0, 1024), inline: false });

  const corpLines: string[] = [];
  if (a.isCeo && a.ceoOf) corpLines.push(`**${a.name}** — CEO of ${a.ceoOf}`);
  if (b.isCeo && b.ceoOf) corpLines.push(`**${b.name}** — CEO of ${b.ceoOf}`);
  if (a.isInvestor) {
    const rank = a.investorRank ? ` (Rank #${a.investorRank})` : "";
    const val = a.portfolioValue != null ? ` · ${formatCurrency(cvtA(a.portfolioValue), displayCurrency)}` : "";
    corpLines.push(`**${a.name}** — Investor${rank}${val}`);
  }
  if (b.isInvestor) {
    const rank = b.investorRank ? ` (Rank #${b.investorRank})` : "";
    const val = b.portfolioValue != null ? ` · ${formatCurrency(cvtB(b.portfolioValue), displayCurrency)}` : "";
    corpLines.push(`**${b.name}** — Investor${rank}${val}`);
  }
  if (corpLines.length > 0) {
    embed.addFields({ name: "Corporate Roles", value: corpLines.join("\n").slice(0, 1024), inline: false });
  }

  const electionLines: string[] = [];
  if (a.activeElection?.electionType) {
    const type = a.activeElection.electionType.charAt(0).toUpperCase() + a.activeElection.electionType.slice(1);
    electionLines.push(`**${a.name}** -- Running in ${type} (${a.activeElection.electionState ?? "Unknown"})`);
  }
  if (b.activeElection?.electionType) {
    const type = b.activeElection.electionType.charAt(0).toUpperCase() + b.activeElection.electionType.slice(1);
    electionLines.push(`**${b.name}** -- Running in ${type} (${b.activeElection.electionState ?? "Unknown"})`);
  }
  if (electionLines.length > 0) {
    embed.addFields({ name: "Active Elections", value: electionLines.join("\n").slice(0, 1024), inline: false });
  }

  return embed;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name1 = interaction.options.getString("politician1", true);
  const name2 = interaction.options.getString("politician2", true);
  const explicitCurrency = interaction.options.getString("currency");

  await interaction.deferReply();

  try {
    const [res1, res2, rates] = await Promise.all([
      lookupByName(name1),
      lookupByName(name2),
      fetchForexRates(),
    ]);

    if (!res1.found || res1.characters.length === 0) {
      await interaction.editReply({ content: `No character found matching "${name1}".` });
      return;
    }
    if (!res2.found || res2.characters.length === 0) {
      await interaction.editReply({ content: `No character found matching "${name2}".` });
      return;
    }

    const charA = res1.characters[0];
    const charB = res2.characters[0];

    if (charA.id === charB.id) {
      await interaction.editReply({ content: "Those are the same character." });
      return;
    }

    const displayCurrency = explicitCurrency || currencyFor(charA.countryId);
    const embed = buildCompareEmbed(charA, charB, displayCurrency, rates);
    const chart = chartAttachment(
      buildCompareChart(charA, charB, displayCurrency, rates),
      "compare",
      `${charA.id}-${charB.id}`,
    );
    embed.setImage(chart.url);
    await interaction.editReply({ embeds: [embed], files: [chart.file] });
  } catch (error) {
    await replyWithError(interaction, "compare", error);
  }
}