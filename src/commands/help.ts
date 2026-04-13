import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} from "discord.js";
import { categories } from "../utils/helpRegistry.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Browse all bot commands");

export function buildOverviewEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📖  A House Divided — Commands")
    .setColor(0x5865f2)
    .setDescription(
      "Your companion for **A House Divided** — a political simulation spanning the US, UK, Japan, Canada, and Germany.\n\nSelect a category below to explore commands in detail."
    )
    .setFooter({ text: "ahousedividedgame.com" });

  for (const cat of categories) {
    const commandList = cat.commands.map((c) => `\`${c.name}\``).join("  ·  ");
    embed.addFields({
      name: `${cat.emoji}  ${cat.label}`,
      value: `${cat.description}\n${commandList}`,
      inline: false,
    });
  }

  return embed;
}

export function buildCategoryEmbed(categoryLabel: string): EmbedBuilder | null {
  const cat = categories.find((c) => c.label === categoryLabel);
  if (!cat) return null;

  const embed = new EmbedBuilder()
    .setTitle(`${cat.emoji}  ${cat.label}`)
    .setColor(cat.color)
    .setDescription(cat.description)
    .setFooter({ text: "ahousedividedgame.com  ·  Use the menu to switch categories" });

  for (const cmd of cat.commands) {
    const examples = cmd.examples.map((e) => `\`${e}\``).join("\n");
    embed.addFields({
      name: cmd.usage,
      value: `${cmd.description}\n\n**Examples**\n${examples}`,
      inline: false,
    });
  }

  return embed;
}

export function buildSelectMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("help_category")
    .setPlaceholder("Choose a category…")
    .addOptions(
      categories.map((cat) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(cat.label)
          .setEmoji(cat.emoji)
          .setDescription(cat.description)
          .setValue(cat.label)
      )
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    embeds: [buildOverviewEmbed()],
    components: [buildSelectMenu()],
    ephemeral: true,
  });
}
