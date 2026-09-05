import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from "discord.js";
import { getParty } from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";
import { respondCountryAutocomplete, validateCountry } from "../utils/countryChoices.js";
import { currencyFor, formatCurrency, convertCurrency, fetchForexRates, symbolFor, CURRENCY_CHOICES, CURRENCY_SYMBOLS } from "../utils/currency.js";
import { renderEntityCard, partyAxisToCompass, compactMoney, compactNumber } from "../utils/viz/index.js";
import { chartAttachment } from "../utils/viz/attach.js";
import { linkList, subtext, meta } from "../utils/embeds.js";
import { COUNTRY_NAMES } from "../utils/formatting.js";

export function ideologyLabel(economic: number, social: number): string {
  const econ = economic < -1 ? "Left" : economic > 1 ? "Right" : "Center";
  const soc = social < -1 ? "Liberal" : social > 1 ? "Conservative" : "Center";
  if (econ === "Center" && soc === "Center") return "Centrist";
  if (soc === "Center") return econ;
  if (econ === "Center") return soc;
  return `${econ}-${soc}`;
}

export const cooldown = 5;

function gameSiteOrigin(): string {
  try {
    return new URL(process.env.GAME_API_URL!).origin;
  } catch {
    return "https://www.ahousedividedgame.com";
  }
}

/**
 * The party's logo, served by the game. The endpoint redirects to the AHD mark
 * when a party has no logo of its own, so this never 404s into a placeholder.
 */
function partyLogoUrl(partyId: string): string {
  return new URL(`/api/logos/parties/${encodeURIComponent(partyId)}`, gameSiteOrigin()).href;
}

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
      .setAutocomplete(true)
  )
  .addStringOption((option) =>
    option
      .setName("currency")
      .setDescription("Display currency for treasury (default: party's home currency)")
      .setRequired(false)
      .addChoices(...CURRENCY_CHOICES)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await respondCountryAutocomplete(interaction);
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString("id", true);
  const country = interaction.options.getString("country", true);
  const explicitCurrency = interaction.options.getString("currency");

  await interaction.deferReply();

  /*
   * Autocomplete does not constrain submitted values the way choices did, so
   * re-check here. Runs AFTER deferReply: a cold country cache makes an HTTP
   * call (60s client timeout) and Discord kills an un-acknowledged interaction
   * after 3s.
   */
  const check = await validateCountry(country);
  if (!check.ok) {
    await interaction.editReply({ content: check.message });
    return;
  }

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

    // Build footer with forex awareness
    const footerParts: string[] = ["Try /party-compare for side-by-side"];
    if (displayCurrency !== "USD" && rates[displayCurrency] && rates[displayCurrency] !== 1) {
      const sym = CURRENCY_SYMBOLS[displayCurrency] ?? displayCurrency;
      const rateVal = displayCurrency === "JPY" ? rates[displayCurrency].toFixed(2) : rates[displayCurrency].toFixed(4);
      footerParts.push(`1 INT = ${sym}${rateVal} ${displayCurrency}`);
    }
    footerParts.push("ahousedividedgame.com");

    const card = await renderEntityCard({
      name: party.name,
      position: [`[${party.abbreviation}]`, COUNTRY_NAMES[country] ?? country.toUpperCase()]
        .filter(Boolean)
        .join(" · "),
      chip: ideologyLabel(party.economicPosition, party.socialPosition),
      accent: party.color,
      avatarUrl: partyLogoUrl(party.id),
      banner: party.chairName ? `Chair: ${party.chairName}` : "Chair: vacant",
      // Party axes are -5..+5 with negative = left; the compass draws the
      // character convention, so both are converted rather than passed raw.
      economic: partyAxisToCompass(party.economicPosition),
      social: partyAxisToCompass(party.socialPosition),
      headline: [
        { label: "Members", value: compactNumber(party.memberCount) },
        { label: "Treasury", value: compactMoney(treasuryConverted, symbolFor(displayCurrency)) },
        { label: "Chair", value: party.chairName ?? "Vacant" },
      ],
      meters: [],
      rows: party.topMembers.slice(0, 5).map((m) => ({ label: m.name, value: m.position })),
      footerLeft: `Values ${displayCurrency}`,
    }).catch(() => null);

    const attachment = card ? chartAttachment(card, "party", party.id) : null;

    const embed = new EmbedBuilder()
      .setTitle(`[${party.abbreviation}] ${party.name}`)
      .setURL(party.partyUrl)
      .setColor(hexToInt(party.color))
      .setFooter({ text: footerParts.join(" · ") });

    // The card lists these members with their offices and carries every figure,
    // so the description keeps only what an image cannot do: the links.
    const memberLinks =
      party.topMembers.length > 0
        ? linkList(party.topMembers.slice(0, 5).map((m) => ({ label: m.name, url: m.profileUrl })))
        : "_No members yet._";

    embed.setDescription(
      [
        "**Top members**",
        memberLinks,
        subtext(
          meta(
            `${party.memberCount.toLocaleString()} members`,
            `Treasury ${formatCurrency(treasuryConverted, displayCurrency)}`,
            ideologyLabel(party.economicPosition, party.socialPosition),
          ),
        ),
      ].join("\n"),
    );

    if (attachment) embed.setImage(attachment.url);

    await interaction.editReply({ embeds: [embed], files: attachment ? [attachment.file] : [] });
  } catch (error) {
    await replyWithError(interaction, "party", error);
  }
}