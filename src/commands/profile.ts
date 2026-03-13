import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
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
  type CharacterResult,
  type CareerEvent,
  type Achievement,
} from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("View a player profile")
  .addStringOption((option) =>
    option.setName("name").setDescription("Character name to search for").setRequired(false)
  )
  .addUserOption((option) =>
    option.setName("user").setDescription("Discord user to look up").setRequired(false)
  );

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

function policyLabel(val: number): string {
  const clamped = Math.max(-100, Math.min(100, val));
  const dir = clamped > 10 ? "Left" : clamped < -10 ? "Right" : "Centre";
  return `${dir} (${clamped > 0 ? "+" : ""}${clamped})`;
}

function buildProfileEmbed(char: CharacterResult): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(char.name)
    .setColor(partyColor(char))
    .setURL(char.profileUrl)
    .setFooter({ text: "ahousedividedgame.com" });

  if (char.bio) {
    embed.setDescription(char.bio.slice(0, 300) + (char.bio.length > 300 ? "…" : ""));
  }

  embed.addFields(
    { name: "Position", value: char.position || "None", inline: true },
    { name: "Party", value: char.partyUrl ? `[${char.party}](${char.partyUrl})` : (char.party || "Unknown"), inline: true },
    { name: "State", value: char.stateUrl ? `[${char.state}](${char.stateUrl})` : (char.state || "Unknown"), inline: true },
    { name: "PI", value: String(char.politicalInfluence ?? 0), inline: true },
    { name: "NPI", value: String(char.nationalInfluence ?? 0), inline: true },
    { name: "Approval", value: `${char.favorability ?? 0}%`, inline: true },
    { name: "Infamy", value: String(char.infamy ?? 0), inline: true },
    { name: "Actions", value: String(char.actions ?? 0), inline: true },
    { name: "Donor Base", value: String(char.donorBaseLevel ?? 0), inline: true },
    { name: "Economic", value: policyLabel(char.policies?.economic ?? 0), inline: true },
    { name: "Social", value: policyLabel(char.policies?.social ?? 0), inline: true },
    { name: "Funds", value: `$${(char.funds ?? 0).toLocaleString()}`, inline: true },
  );

  if (char.createdAt) {
    const ts = Math.floor(new Date(char.createdAt).getTime() / 1000);
    embed.addFields({ name: "Created", value: `<t:${ts}:R>`, inline: true });
  }

  if (char.activeElection) {
    const electionType = char.activeElection.electionType.charAt(0).toUpperCase() + char.activeElection.electionType.slice(1);
    const electionState = char.activeElection.electionState;
    embed.addFields({ name: "Active Election", value: `${electionType} (${electionState})`, inline: false });
  }

  if (char.avatarUrl) embed.setThumbnail(char.avatarUrl);

  return embed;
}

function buildCareerEmbed(char: CharacterResult, career: CareerEvent[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${char.name} — Career History`)
    .setColor(partyColor(char))
    .setURL(char.profileUrl)
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
    .setURL(char.profileUrl)
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

  await interaction.deferReply();

  try {
    const result = name
      ? await lookupByName(name)
      : await lookupByDiscordId(user?.id ?? interaction.user.id);

    if (result.characters.length === 0) {
      const message = name
        ? `No characters found matching "${name}".`
        : user
          ? `No linked account found for ${user.username}.`
          : "No characters linked to your Discord account. Try `/profile name:YourCharacterName` or connect your account on the website.";
      await interaction.editReply({ content: message });
      return;
    }

    const char = result.characters[0];
    const extras =
      result.characters.length > 1
        ? `\n-# ${result.characters.length - 1} more result(s) — try a more specific name.`
        : "";

    let careerCache: CareerEvent[] | null = null;
    let achievementsCache: Achievement[] | null = null;
    let activeTab: Tab = "profile";

    const message = await interaction.editReply({
      content: extras || undefined,
      embeds: [buildProfileEmbed(char)],
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
        await btn.editReply({ embeds: [buildProfileEmbed(char)], components: [buildTabRow("profile")] });
      } else if (btn.customId === "tab_career") {
        activeTab = "career";
        if (!careerCache) {
          const res = await getCareer({ characterId: char.id });
          careerCache = res.career;
        }
        await btn.editReply({
          embeds: [buildCareerEmbed(char, careerCache)],
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
