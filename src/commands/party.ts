import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getParty } from "../utils/api.js";
import { hexToInt, replyWithError, standardFooter } from "../utils/helpers.js";
import { currencyFor, formatCurrency, convertCurrency, fetchForexRates, CURRENCY_CHOICES } from "../utils/currency.js";

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
      .setDescription("Party ID number (e.g. 1, 2, 3)")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("country")
      .setDescription("Country code (e.g. US, UK, JP)")
      .setRequired(true)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" },
        { name: "Japan", value: "JP" },
        { name: "Canada", value: "CA" },
        { name: "Germany", value: "DE" },
      )
  )
  .addStringOption((option) =>
    option
      .setName("currency")
      .setDescription("Display currency for treasury (default: party's home currency)")
      .setRequired(false)
      .addChoices(...CURRENCY_CHOICES)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString("id", true);
  const country = interaction.options.getString("country", true);
  const explicitCurrency = interaction.options.getString("currency");

  await interaction.deferReply();

  try {
    const [result, rates] = await Promise.all([
      getParty(id, country),
      fetchForexRates(),
    ]);

    if (!result.found || !result.party) {
      await interaction.editReply({
        content: "Party not found. Use the party ID number (e.g. `1`, `2`) with the correct country.",
      });
      return;
    }

    const party = result.party;
    const nativeCc = currencyFor(country);
    const displayCurrency = explicitCurrency || nativeCc;
    const treasuryConverted = Math.round(convertCurrency(party.treasury, nativeCc, displayCurrency, rates));

    const topMembersValue =
      party.topMembers
        .slice(0, 5)
        .map((m, i) => `${i + 1}. ${m.name} — ${m.position}`)
        .join("\n") || "None";

    // Build footer with forex awareness
    const footerParts: string[] = ["Try /party-compare for side-by-side"];
    if (displayCurrency !== "USD" && rates[displayCurrency] && rates[displayCurrency] !== 1) {
      const sym = { USD: "$", GBP: "£", JPY: "¥", CAD: "C$", EUR: "€" }[displayCurrency] ?? displayCurrency;
      const rateVal = displayCurrency === "JPY" ? rates[displayCurrency].toFixed(2) : rates[displayCurrency].toFixed(4);
      footerParts.push(`1 INT = ${sym}${rateVal} ${displayCurrency}`);
    }
    footerParts.push("ahousedividedgame.com");

    const embed = new EmbedBuilder()
      .setTitle(`[${party.abbreviation}] ${party.name}`)
      .setURL(party.partyUrl)
      .setColor(hexToInt(party.color))
      .addFields(
        { name: "Chair", value: party.chairName ?? "Vacant", inline: true },
        { name: "Members", value: party.memberCount.toLocaleString(), inline: true },
        { name: "Treasury", value: formatCurrency(treasuryConverted, displayCurrency), inline: true },
        {
          name: "Ideology",
          value: ideologyLabel(party.economicPosition, party.socialPosition),
          inline: true,
        },
        { name: "Top Members", value: topMembersValue }
      )
      .setFooter({ text: footerParts.join(" · ") });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "party", error);
  }
}