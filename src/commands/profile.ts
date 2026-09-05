import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import {
  lookupByName,
  lookupByDiscordId,
  getCareer,
  getAchievements,
  getSyncRoles,
  getAutocomplete,
  type CharacterResult,
  type CareerEvent,
  type Achievement,
} from "../utils/api.js";
import { syncMemberRoles } from "../utils/roles.js";
import { hexToInt, replyWithError, safeEmbedUrl } from "../utils/helpers.js";
import { formatOfficeType, COUNTRY_FLAG, COUNTRY_NAMES } from "../utils/formatting.js";
import { currencyFor, formatCurrency, convertCurrency, fetchForexRates, symbolFor, CURRENCY_CHOICES, CURRENCY_SYMBOLS } from "../utils/currency.js";
import { renderProfileCard, approvalColor, infamyColor, compactMoney, compactNumber } from "../utils/viz/index.js";
import { chartAttachment } from "../utils/viz/attach.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("View a player profile")
  .addStringOption((option) =>
    option.setName("name").setDescription("Character name to search for").setRequired(false).setAutocomplete(true)
  )
  .addUserOption((option) =>
    option.setName("user").setDescription("Discord user to look up").setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("currency")
      .setDescription("Display currency (default: character's home currency)")
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

type Tab = "profile" | "career" | "achievements";

const CAREER_EMOJI: Record<string, string> = {
  elected: "✅",
  lost_election: "❌",
  resigned: "🏳️",
  appointed: "📋",
  removed: "🚫",
};

function partyColor(char: CharacterResult): number {
  return hexToInt(char.partyColor);
}

/**
 * The profile card.
 *
 * Approval and infamy are the only two stats with a real 0–100 domain, so they
 * are the only two that get meters — a bar for PI or donor base would be
 * inventing a denominator the bot is never told. Everything else is a figure.
 */
async function buildProfileCard(
  char: CharacterResult,
  displayCurrency: string,
  rates: Record<string, number>,
): Promise<Buffer> {
  const nativeCc = currencyFor(char.countryId);
  const sym = symbolFor(displayCurrency);
  const money = (n: number) => compactMoney(convertCurrency(n, nativeCc, displayCurrency, rates), sym);

  const position = [
    char.position || "No office",
    char.state,
    char.countryId ? COUNTRY_NAMES[char.countryId] ?? char.countryId.toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const rows: Array<{ label: string; value: string }> = [
    { label: "Actions", value: String(Math.round(char.actions ?? 0)) },
    { label: "Donor base", value: char.donorBaseLevel != null ? `Level ${Math.round(char.donorBaseLevel)}` : "—" },
  ];
  if (char.isInvestor && char.portfolioValue != null) {
    const rank = char.investorRank ? ` · #${char.investorRank}` : "";
    rows.push({ label: "Portfolio", value: `${money(char.portfolioValue)}${rank}` });
  }
  if (char.isCeo && char.ceoOf) rows.push({ label: "CEO of", value: char.ceoOf });
  if (char.createdAt) {
    const d = new Date(char.createdAt);
    if (!isNaN(d.getTime())) {
      rows.push({
        label: "Joined",
        value: d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }),
      });
    }
  }

  const approval = Math.round(char.favorability ?? 0);
  const infamy = Math.round(char.infamy ?? 0);

  const activeElection = char.activeElection?.electionType
    ? `Contesting: ${char.activeElection.electionLabel ?? formatOfficeType(char.activeElection.electionType)}` +
      ` (${char.activeElection.electionState ?? "Unknown"})`
    : null;

  return renderProfileCard({
    name: char.name,
    position,
    party: char.party || null,
    accent: char.partyColor,
    avatarUrl: safeEmbedUrl(char.avatarUrl) ?? safeEmbedUrl(char.discordAvatarUrl),
    banner: activeElection,
    economic: char.policies?.economic ?? null,
    social: char.policies?.social ?? null,
    headline: [
      { label: "Political influence", value: compactNumber(Math.round(char.politicalInfluence ?? 0)) },
      { label: "National influence", value: compactNumber(Math.round(char.nationalInfluence ?? 0)) },
      { label: "Funds", value: money(char.funds ?? 0) },
    ],
    meters: [
      { label: "Approval", value: approval, display: `${approval}%`, color: approvalColor(approval) },
      { label: "Infamy", value: infamy, display: `${infamy} / 100`, color: infamyColor(infamy) },
    ],
    rows,
    footerLeft: `Values ${displayCurrency}`,
  });
}

/**
 * The embed that carries the card.
 *
 * Everything numeric moved onto the card image, so this keeps only what an
 * image cannot do: clickable links, the bio, and the text equivalent of the
 * headline stats for screen readers and anyone whose client blocks images.
 */
function buildProfileEmbed(char: CharacterResult, displayCurrency: string, rates: Record<string, number>): EmbedBuilder {
  const nativeCc = currencyFor(char.countryId);
  const cvt = (n: number) => convertCurrency(n, nativeCc, displayCurrency, rates);
  const fmt = (n: number) => formatCurrency(Math.round(n), displayCurrency);

  const embed = new EmbedBuilder()
    .setTitle(char.name)
    .setColor(partyColor(char))
    .setURL(safeEmbedUrl(char.profileUrl) ?? null);

  const footerParts: string[] = [];
  if (displayCurrency !== "USD" && rates[displayCurrency] && rates[displayCurrency] !== 1) {
    const sym = CURRENCY_SYMBOLS[displayCurrency] ?? displayCurrency;
    const rateVal = displayCurrency === "JPY" ? rates[displayCurrency].toFixed(2) : rates[displayCurrency].toFixed(4);
    footerParts.push(`1 INT = ${sym}${rateVal} ${displayCurrency}`);
  }
  footerParts.push("ahousedividedgame.com");
  embed.setFooter({ text: footerParts.join(" · ") });

  const flag = COUNTRY_FLAG[char.countryId ?? ""] ? `${COUNTRY_FLAG[char.countryId!]} ` : "";
  const links = [
    `${flag}**${char.position || "No office"}**`,
    char.partyUrl ? `[${char.party}](${char.partyUrl})` : char.party || "Unknown party",
    char.stateUrl ? `[${char.state}](${char.stateUrl})` : char.state || "Unknown state",
    char.countryUrl ? `[Country](${char.countryUrl})` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Text equivalent of the card's headline figures — a PNG has no accessible form.
  const stats =
    `PI ${Math.round(char.politicalInfluence ?? 0).toLocaleString()} · ` +
    `NPI ${Math.round(char.nationalInfluence ?? 0).toLocaleString()} · ` +
    `Approval ${Math.round(char.favorability ?? 0)}% · ` +
    `Infamy ${Math.round(char.infamy ?? 0)} · ` +
    `Funds ${fmt(cvt(char.funds ?? 0))}`;

  const bio = char.bio ? `\n\n${char.bio.slice(0, 300)}${char.bio.length > 300 ? "..." : ""}` : "";
  const hint = "\n-# Try `/compare` for side-by-side or `/investor` for portfolio details";

  embed.setDescription(`${links}\n-# ${stats}${bio}${hint}`.slice(0, 4096));

  return embed;
}

function buildCareerEmbed(char: CharacterResult, career: CareerEvent[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${char.name} — Career History`)
    .setColor(partyColor(char))
    .setURL(safeEmbedUrl(char.profileUrl) ?? null)
    .setFooter({ text: "ahousedividedgame.com" });

  if (career.length === 0) {
    embed.setDescription("No career history yet.");
    return embed;
  }

  const lines = career.slice(0, 20).map((event) => {
    const emoji = CAREER_EMOJI[event.type] ?? "•";
    const ts = Math.floor(new Date(event.date).getTime() / 1000);
    return `${emoji} **${event.office}** — <t:${ts}:D>`;
  });

  embed.setDescription(lines.join("\n").slice(0, 4096));
  return embed;
}

function buildAchievementsEmbed(char: CharacterResult, achievements: Achievement[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${char.name} — Achievements`)
    .setColor(partyColor(char))
    .setURL(safeEmbedUrl(char.profileUrl) ?? null)
    .setFooter({ text: "ahousedividedgame.com" });

  if (achievements.length === 0) {
    embed.setDescription("No achievements earned yet.");
    return embed;
  }

  const sorted = [...achievements].sort((a, b) => Number(b.isHighlighted) - Number(a.isHighlighted));

  const lines = sorted.slice(0, 25).map((ach) => {
    const star = ach.isHighlighted ? " ⭐" : "";
    return `${ach.icon} **${ach.name}**${star}\n${ach.description}`;
  });

  embed.setDescription(lines.join("\n\n").slice(0, 4096));
  return embed;
}

function buildTabRow(active: Tab, disabled = false): ActionRowBuilder<ButtonBuilder> {
  const btn = (id: string, label: string, tab: Tab) =>
    new ButtonBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(active === tab ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disabled);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn("tab_profile", "Profile", "profile"),
    btn("tab_career", "Career", "career"),
    btn("tab_achievements", "Achievements", "achievements"),
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
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

    if (result.characters.length === 0) {
      const message = name
        ? `No characters found matching "${name}".`
        : user
          ? `No linked account found for ${user.username}.`
          : "Your Discord account isn't linked to any characters yet. To link your account, go to **Settings** in [A House Divided](https://www.ahousedividedgame.com/) and connect your Discord.";
      await interaction.editReply({ content: message });
      return;
    }

    const char = result.characters[0];
    const displayCurrency = explicitCurrency || currencyFor(char.countryId);

    // Best-effort: sync the invoking user's own game roles on every /profile run
    interaction.guild?.members.fetch(interaction.user.id).then(async (member) => {
      const syncResult = await getSyncRoles(interaction.user.id);
      if (syncResult.found && syncResult.roles.length > 0) {
        await syncMemberRoles(member, syncResult.roles, syncResult.details);
      }
    }).catch(() => {});

    const extras =
      result.characters.length > 1
        ? `\n-# ${result.characters.length - 1} more result(s) — try a more specific name.`
        : "";

    let careerCache: CareerEvent[] | null = null;
    let achievementsCache: Achievement[] | null = null;
    let activeTab: Tab = "profile";

    const profileCard = await buildProfileCard(char, displayCurrency, rates).catch(() => null);
    const cardAttachment = profileCard ? chartAttachment(profileCard, "profile", char.id) : null;
    const profileEmbed = buildProfileEmbed(char, displayCurrency, rates);
    if (cardAttachment) profileEmbed.setImage(cardAttachment.url);

    const message = await interaction.editReply({
      content: extras || undefined,
      embeds: [profileEmbed],
      files: cardAttachment ? [cardAttachment.file] : [],
      components: [buildTabRow("profile")],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: "This isn't your profile lookup.", ephemeral: true });
        return;
      }

      await btn.deferUpdate();

      if (btn.customId === "tab_profile") {
        activeTab = "profile";
        // Re-attach: switching tabs replaces the message's files, so the card
        // has to be sent again or the embed's image reference dangles.
        const card = await buildProfileCard(char, displayCurrency, rates).catch(() => null);
        const attachment = card ? chartAttachment(card, "profile", char.id) : null;
        const embed = buildProfileEmbed(char, displayCurrency, rates);
        if (attachment) embed.setImage(attachment.url);
        await btn.editReply({
          embeds: [embed],
          files: attachment ? [attachment.file] : [],
          components: [buildTabRow("profile")],
        });
      } else if (btn.customId === "tab_career") {
        activeTab = "career";
        if (!careerCache) {
          const res = await getCareer({ characterId: char.id });
          careerCache = res.career;
        }
        await btn.editReply({
          embeds: [buildCareerEmbed(char, careerCache)],
          files: [],
          components: [buildTabRow("career")],
        });
      } else if (btn.customId === "tab_achievements") {
        activeTab = "achievements";
        if (!achievementsCache) {
          const res = await getAchievements({ characterId: char.id });
          achievementsCache = res.achievements;
        }
        await btn.editReply({
          embeds: [buildAchievementsEmbed(char, achievementsCache)],
          files: [],
          components: [buildTabRow("achievements")],
        });
      }
    });

    collector.on("end", () => {
      interaction.editReply({ components: [buildTabRow(activeTab, true)] }).catch(() => {});
    });
  } catch (error) {
    await replyWithError(interaction, "profile", error);
  }
}