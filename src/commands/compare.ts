import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { lookupByName, type CharacterResult } from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("compare")
  .setDescription("Compare two politicians side by side")
  .addStringOption((o) =>
    o.setName("politician1").setDescription("First character name").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("politician2").setDescription("Second character name").setRequired(true)
  );

function policyLabel(val: number): string {
  const clamped = Math.round(Math.max(-100, Math.min(100, val)));
  const dir = clamped > 10 ? "Left" : clamped < -10 ? "Right" : "Centre";
  return `${dir} (${clamped > 0 ? "+" : ""}${clamped})`;
}

function statRow(label: string, a: string, b: string): string {
  return `**${label}**\n${a} vs ${b}`;
}

function buildCompareEmbed(a: CharacterResult, b: CharacterResult): EmbedBuilder {
  // Use the dominant party color, fall back to blurple
  const colorA = hexToInt(a.partyColor);
  const colorB = hexToInt(b.partyColor);
  const color = colorA !== 0x5865f2 ? colorA : colorB;

  const nameA = a.profileUrl ? `[${a.name}](${a.profileUrl})` : a.name;
  const nameB = b.profileUrl ? `[${b.name}](${b.profileUrl})` : b.name;

  const embed = new EmbedBuilder()
    .setTitle(`⚖️ ${a.name} vs ${b.name}`.slice(0, 256))
    .setColor(color)
    .setFooter({ text: "ahousedividedgame.com" });

  embed.addFields(
    {
      name: "Politician",
      value: nameA,
      inline: true,
    },
    {
      name: "\u200b",
      value: "vs",
      inline: true,
    },
    {
      name: "\u200b",
      value: nameB,
      inline: true,
    },
    {
      name: "Party",
      value: a.partyUrl ? `[${a.party}](${a.partyUrl})` : (a.party || "Unknown"),
      inline: true,
    },
    { name: "\u200b", value: "\u200b", inline: true },
    {
      name: "\u200b",
      value: b.partyUrl ? `[${b.party}](${b.partyUrl})` : (b.party || "Unknown"),
      inline: true,
    },
    {
      name: "Position",
      value: a.position || "None",
      inline: true,
    },
    { name: "\u200b", value: "\u200b", inline: true },
    {
      name: "\u200b",
      value: b.position || "None",
      inline: true,
    },
    {
      name: "State",
      value: a.stateUrl ? `[${a.state}](${a.stateUrl})` : (a.state || "Unknown"),
      inline: true,
    },
    { name: "\u200b", value: "\u200b", inline: true },
    {
      name: "\u200b",
      value: b.stateUrl ? `[${b.state}](${b.stateUrl})` : (b.state || "Unknown"),
      inline: true,
    },
  );

  // Stats comparison block
  const statsLines = [
    statRow("Political Influence", Math.round(a.politicalInfluence ?? 0).toLocaleString(), Math.round(b.politicalInfluence ?? 0).toLocaleString()),
    statRow("National PI", Math.round(a.nationalInfluence ?? 0).toLocaleString(), Math.round(b.nationalInfluence ?? 0).toLocaleString()),
    statRow("Approval", `${Math.round(a.favorability ?? 0)}%`, `${Math.round(b.favorability ?? 0)}%`),
    statRow("Infamy", String(Math.round(a.infamy ?? 0)), String(Math.round(b.infamy ?? 0))),
    statRow("Funds", `$${Math.round(a.funds ?? 0).toLocaleString()}`, `$${Math.round(b.funds ?? 0).toLocaleString()}`),
    statRow("Actions", String(Math.round(a.actions ?? 0)), String(Math.round(b.actions ?? 0))),
  ];

  embed.addFields({
    name: "Stats",
    value: statsLines.join("\n").slice(0, 1024),
    inline: false,
  });

  // Policy positions
  const policyLines = [
    statRow("Economic", policyLabel(a.policies?.economic ?? 0), policyLabel(b.policies?.economic ?? 0)),
    statRow("Social", policyLabel(a.policies?.social ?? 0), policyLabel(b.policies?.social ?? 0)),
  ];
  embed.addFields({
    name: "Policy Positions",
    value: policyLines.join("\n").slice(0, 1024),
    inline: false,
  });

  // Corporate roles if either holds one
  const corpLines: string[] = [];
  if (a.isCeo && a.ceoOf) corpLines.push(`**${a.name}** — CEO of ${a.ceoOf}`);
  if (b.isCeo && b.ceoOf) corpLines.push(`**${b.name}** — CEO of ${b.ceoOf}`);
  if (a.isInvestor) {
    const rank = a.investorRank ? ` (Rank #${a.investorRank})` : "";
    const val = a.portfolioValue != null ? ` · $${Math.round(a.portfolioValue).toLocaleString()}` : "";
    corpLines.push(`**${a.name}** — Investor${rank}${val}`);
  }
  if (b.isInvestor) {
    const rank = b.investorRank ? ` (Rank #${b.investorRank})` : "";
    const val = b.portfolioValue != null ? ` · $${Math.round(b.portfolioValue).toLocaleString()}` : "";
    corpLines.push(`**${b.name}** — Investor${rank}${val}`);
  }
  if (corpLines.length > 0) {
    embed.addFields({
      name: "Corporate Roles",
      value: corpLines.join("\n").slice(0, 1024),
      inline: false,
    });
  }

  return embed;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name1 = interaction.options.getString("politician1", true);
  const name2 = interaction.options.getString("politician2", true);

  await interaction.deferReply();

  try {
    const [res1, res2] = await Promise.all([
      lookupByName(name1),
      lookupByName(name2),
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

    await interaction.editReply({ embeds: [buildCompareEmbed(charA, charB)] });
  } catch (error) {
    await replyWithError(interaction, "compare", error);
  }
}
