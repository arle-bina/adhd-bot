import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from "discord.js";
import { lookupByName, lookupByDiscordId, getAutocomplete } from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("investor")
  .setDescription("Look up a politician's corporate positions — CEO roles, investor rank, and portfolio")
  .addStringOption((o) =>
    o.setName("name").setDescription("Character name to search for").setRequired(false).setAutocomplete(true)
  )
  .addUserOption((o) =>
    o.setName("user").setDescription("Discord user to look up").setRequired(false)
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

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString("name");
  const user = interaction.options.getUser("user");
  const isSelf = !name && !user;

  await interaction.deferReply({ ephemeral: isSelf });

  try {
    const result = name
      ? await lookupByName(name)
      : await lookupByDiscordId(user?.id ?? interaction.user.id);

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

    const hasCorpRole = char.isCeo || char.isInvestor;

    if (!hasCorpRole) {
      const nameStr = char.profileUrl ? `[${char.name}](${char.profileUrl})` : char.name;
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${char.name} — Corporate Positions`)
            .setColor(color)
            .setDescription(`${nameStr} holds no corporate roles.`)
            .setFooter({ text: "ahousedividedgame.com" }),
        ],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${char.name} — Corporate Positions`.slice(0, 256))
      .setColor(color)
      .setURL(char.profileUrl)
      .setFooter({ text: "ahousedividedgame.com" });

    if (char.avatarUrl) embed.setThumbnail(char.avatarUrl);

    const lines: string[] = [];

    if (char.isCeo && char.ceoOf) {
      lines.push(`👔 **CEO** — ${char.ceoOf}`);
    }

    if (char.isInvestor) {
      const medal = char.investorRank ? (RANK_MEDAL[char.investorRank] ?? "") : "";
      const rankStr = char.investorRank ? ` (Rank #${char.investorRank} ${medal})` : "";
      const portfolio = char.portfolioValue != null
        ? `$${Math.round(char.portfolioValue).toLocaleString()}`
        : "Value unknown";
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
