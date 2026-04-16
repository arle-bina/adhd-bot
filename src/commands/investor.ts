import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from "discord.js";
import { lookupByName, lookupByDiscordId, getAutocomplete } from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";
import { currencyFor, formatCurrency, convertCurrency, fetchForexRates, CURRENCY_CHOICES } from "../utils/currency.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("investor")
  .setDescription("Look up a politician's corporate positions — CEO roles, investor rank, and portfolio")
  .addStringOption((o) =>
    o.setName("name").setDescription("Character name to search for").setRequired(false).setAutocomplete(true)
  )
  .addUserOption((o) =>
    o.setName("user").setDescription("Discord user to look up").setRequired(false)
  )
  .addStringOption((o) =>
    o
      .setName("currency")
      .setDescription("Display currency for portfolio value (default: character's home currency)")
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

const RANK_MEDAL: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

function makeForexFooter(displayCurrency: string, rates: Record<string, number>, nativeCc?: string): string {
  const parts: string[] = [];
  if (displayCurrency !== "USD" && rates[displayCurrency] && rates[displayCurrency] !== 1) {
    const sym = { USD: "$", GBP: "£", JPY: "¥", CAD: "C$", EUR: "€" }[displayCurrency] ?? displayCurrency;
    const rateVal = displayCurrency === "JPY" ? rates[displayCurrency].toFixed(2) : rates[displayCurrency].toFixed(4);
    parts.push(`1 INT = ${sym}${rateVal} ${displayCurrency}`);
  }
  parts.push("ahousedividedgame.com");
  return parts.join(" · ");
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString("name");
  const user = interaction.options.getUser("user");
  const explicitCurrency = interaction.options.getString("currency");
  const isSelf = !name && !user;

  await interaction.deferReply({ ephemeral: isSelf });

  try {
    const [result, rates] = await Promise.all([
      name
        ? lookupByName(name)
        : lookupByDiscordId(user?.id ?? interaction.user.id),
      fetchForexRates(),
    ]);

    if (!result.found || result.characters.length === 0) {
      const message = name
        ? `No character found matching "${name}".`
        : user
          ? `No linked account found for ${user.username}.`
          : "Your Discord account isn't linked to any characters yet.";
      await interaction.editReply({ content: message });
      return;
    }

    const char = result.characters[0];
    const color = hexToInt(char.partyColor);
    const nativeCc = currencyFor(char.countryId);
    const displayCurrency = explicitCurrency || nativeCc;

    const hasCorpRole = char.isCeo || char.isInvestor;

    if (!hasCorpRole) {
      const nameStr = char.profileUrl ? `[${char.name}](${char.profileUrl})` : char.name;
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${char.name} — Corporate Positions`)
            .setColor(color)
            .setDescription(`${nameStr} holds no corporate roles.`)
            .setFooter({ text: makeForexFooter(displayCurrency, rates, nativeCc) }),
        ],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${char.name} — Corporate Positions`.slice(0, 256))
      .setColor(color)
      .setURL(char.profileUrl)
      .setFooter({ text: makeForexFooter(displayCurrency, rates, nativeCc) });

    if (char.avatarUrl) embed.setThumbnail(char.avatarUrl);

    const lines: string[] = [];

    if (char.isCeo && char.ceoOf) {
      lines.push(`👔 **CEO** — ${char.ceoOf}`);
    }

    if (char.isInvestor) {
      const medal = char.investorRank ? (RANK_MEDAL[char.investorRank] ?? "") : "";
      const rankStr = char.investorRank ? ` (Rank #${char.investorRank} ${medal})` : "";
      const portfolioConverted = Math.round(convertCurrency(char.portfolioValue ?? 0, nativeCc, displayCurrency, rates));
      const portfolio = formatCurrency(portfolioConverted, displayCurrency);
      lines.push(`📈 **Investor**${rankStr} — Portfolio: ${portfolio}`);
    }

    embed.setDescription(lines.join("\n"));

    embed.addFields(
      { name: "Political Influence", value: Math.round(char.politicalInfluence ?? 0).toLocaleString(), inline: true },
      { name: "Approval", value: `${Math.round(char.favorability ?? 0)}%`, inline: true },
      { name: "Party", value: char.partyUrl ? `[${char.party}](${char.partyUrl})` : (char.party || "Unknown"), inline: true },
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "investor", error);
  }
}