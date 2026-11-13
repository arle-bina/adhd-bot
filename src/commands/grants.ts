import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { fetchGrants, isLakesideConfigured } from "../utils/api-lakeside.js";
import { replyWithError, standardFooter } from "../utils/helpers.js";

const NEUTRAL_COLOR = 0x5865f2;
const ERROR_COLOR = 0xed4245;
const MAX_LINES = 40;

export const data = new SlashCommandBuilder()
  .setName("grants")
  .setDescription("See access given through the Lakeside account service (owner and cofounder only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("user")
      .setDescription("What one player has and why")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("Discord user to look up").setRequired(true),
      ),
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("Every active grant"));

function wordsBlock(words: string[]): string {
  if (words.length === 0) return "No active grants.";
  const lines = words.slice(0, MAX_LINES).map((w) => `- ${w}`);
  if (words.length > MAX_LINES) lines.push(`...and ${words.length - MAX_LINES} more.`);
  return lines.join("\n").slice(0, 4000);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isLakesideConfigured()) {
    await interaction.reply({ content: "Lakeside grants are not configured on this bot.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const target = sub === "user" ? interaction.options.getUser("user", true) : null;

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await fetchGrants(interaction.user.id, target?.id);
    if (!result.ok) {
      const embed = new EmbedBuilder()
        .setTitle("/grants")
        .setColor(ERROR_COLOR)
        .setDescription(result.message)
        .setFooter(standardFooter());
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const { words, access, claimed } = result.data;
    const embed = new EmbedBuilder()
      .setTitle(target ? "Grants for this player" : "Active grants")
      .setColor(NEUTRAL_COLOR)
      .setDescription((target ? `<@${target.id}>\n\n` : "") + wordsBlock(words))
      .setFooter(standardFooter());

    if (target && access && access.length > 0) {
      embed.addFields({ name: "They have access to", value: access.join(", ").slice(0, 1024) });
    }
    if (target && typeof claimed === "boolean") {
      embed.addFields({
        name: "Account",
        value: claimed ? "Signed in at least once." : "Has not signed in yet.",
      });
    }
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "grants", error);
  }
}
