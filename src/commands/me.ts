import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type InteractionReplyOptions,
} from "discord.js";
import { lookupByDiscordId, lookupByName, getElections, type CharacterResult } from "../utils/api.js";
import { replyWithError, standardFooter, hexToInt, safeEmbedUrl } from "../utils/helpers.js";
import { formatOfficeType, formatElectionType, COUNTRY_FLAG } from "../utils/formatting.js";
import { currencyFor, symbolFor } from "../utils/currency.js";
import { resolveDefaults, formatNumber, type ResolvedDefaults } from "../utils/userPrefsStore.js";

export const cooldown = 5;

export const ME_REFRESH_ID = "prefs_me_refresh";

export const data = new SlashCommandBuilder()
  .setName("me")
  .setDescription("Your personal dashboard: office, party, funds, approval and upcoming elections");

type MeReply = Pick<InteractionReplyOptions, "embeds" | "components" | "content">;

async function findCharacter(userId: string, defaults: ResolvedDefaults): Promise<{ char: CharacterResult; linked: boolean } | null> {
  const linked = await lookupByDiscordId(userId);
  if (linked.found && linked.characters.length > 0) return { char: linked.characters[0], linked: true };
  if (defaults.politician) {
    const byName = await lookupByName(defaults.politician);
    if (byName.found && byName.characters.length > 0) return { char: byName.characters[0], linked: false };
  }
  return null;
}

/** Builds the dashboard reply for a user. Shared by /me and its refresh button. */
export async function buildMeReply(userId: string): Promise<MeReply> {
  const defaults = resolveDefaults(userId);
  const found = await findCharacter(userId, defaults);
  if (!found) {
    return {
      content:
        "No linked character found. Link your Discord account on the game site, or set a default politician with `/settings`.",
    };
  }
  const { char, linked } = found;
  const sym = symbolFor(currencyFor(char.countryId));
  const fmt = (n: number) => `${sym}${formatNumber(n, defaults.numberFormat)}`;
  const num = (n: number) => formatNumber(n, defaults.numberFormat);

  const office = char.officeType ? formatOfficeType(char.officeType) : char.position || "No office";
  const flag = char.countryId ? COUNTRY_FLAG[char.countryId] ?? "" : "";

  const embed = new EmbedBuilder()
    .setTitle(`${flag ? `${flag} ` : ""}${char.name}`)
    .setColor(defaults.accentColor ?? hexToInt(char.partyColor))
    .setDescription(`${office}${char.state ? ` · ${char.state}` : ""}\n${char.party || "Independent"}`)
    .addFields(
      { name: "Funds", value: fmt(char.funds ?? 0), inline: true },
      { name: "Approval", value: `${Math.round(char.favorability ?? 0)}%`, inline: true },
      { name: "Infamy", value: num(char.infamy ?? 0), inline: true },
      { name: "Political influence", value: num(char.politicalInfluence ?? 0), inline: true },
      { name: "National influence", value: num(char.nationalInfluence ?? 0), inline: true },
      { name: "Actions", value: num(char.actions ?? 0), inline: true },
    )
    .setFooter(standardFooter(linked ? undefined : "Following via default politician"));

  const avatar = safeEmbedUrl(char.avatarUrl ?? char.discordAvatarUrl);
  if (avatar) embed.setThumbnail(avatar);

  // Elections the character is in: their active entry plus any race listing them as a candidate.
  const lines: string[] = [];
  if (char.activeElection) {
    const e = char.activeElection;
    const label = e.electionLabel ?? formatElectionType(e.electionType);
    lines.push(`**${label}** (${e.electionState}), entered <t:${Math.floor(new Date(e.enteredAt).getTime() / 1000)}:R>`);
  }
  try {
    if (char.countryId) {
      const res = await getElections({ country: char.countryId });
      if (res.found) {
        for (const e of res.elections) {
          if (!e.candidates.some((c) => c.characterId === char.id)) continue;
          if (char.activeElection && e.id === char.activeElection.electionId) continue;
          const when = e.status === "active" ? (e.endTime ? `ends <t:${Math.floor(new Date(e.endTime).getTime() / 1000)}:R>` : "active") : e.startTime ? `starts <t:${Math.floor(new Date(e.startTime).getTime() / 1000)}:R>` : "upcoming";
          lines.push(`**${formatElectionType(e.electionType)}** (${e.state}), ${when}`);
        }
      }
    }
  } catch {
    // Elections are a bonus section; the rest of the dashboard still renders.
  }
  embed.addFields({
    name: "Elections",
    value: (lines.length > 0 ? lines.slice(0, 6).join("\n") : "Not in any election right now.").slice(0, 1024),
  });

  const row = new ActionRowBuilder<ButtonBuilder>();
  const profileUrl = safeEmbedUrl(char.profileUrl);
  if (profileUrl) row.addComponents(new ButtonBuilder().setLabel("Profile").setStyle(ButtonStyle.Link).setURL(profileUrl));
  const partyUrl = safeEmbedUrl(char.partyUrl);
  if (partyUrl) row.addComponents(new ButtonBuilder().setLabel("Party").setStyle(ButtonStyle.Link).setURL(partyUrl));
  row.addComponents(new ButtonBuilder().setCustomId(ME_REFRESH_ID).setLabel("Refresh").setStyle(ButtonStyle.Secondary));

  return { embeds: [embed], components: [row] };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const ephemeral = resolveDefaults(interaction.user.id).ephemeral;
  await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
  try {
    const reply = await buildMeReply(interaction.user.id);
    await interaction.editReply(reply);
  } catch (error) {
    await replyWithError(interaction, "me", error);
  }
}

/** Handles `prefs_me_*` buttons. Routed through the settings command's handleComponent. */
export async function handleComponent(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId !== ME_REFRESH_ID) return;
  await interaction.deferUpdate();
  try {
    const reply = await buildMeReply(interaction.user.id);
    await interaction.editReply({ content: reply.content ?? null, embeds: reply.embeds ?? [], components: reply.components ?? [] });
  } catch {
    await interaction.followUp({ content: "Could not refresh right now.", flags: MessageFlags.Ephemeral });
  }
}
