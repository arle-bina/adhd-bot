import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} from "discord.js";
import { postDiscordSuggestion } from "../utils/api-game.js";

export const cooldown = 30;

const CATEGORY_CHOICES = [
  { name: "Feature Request", value: "feature_request" },
  { name: "UI Improvement", value: "ui_improvement" },
  { name: "Game Balance", value: "game_balance" },
  { name: "New Content", value: "new_content" },
  { name: "Accessibility", value: "accessibility" },
  { name: "Other", value: "other" },
] as const;

const GAME_SYSTEM_CHOICES = [
  { name: "Elections", value: "elections" },
  { name: "Legislature", value: "legislature" },
  { name: "Executive", value: "executive" },
  { name: "Judiciary", value: "judiciary" },
  { name: "Economy", value: "economy" },
  { name: "Corporations", value: "corporations" },
  { name: "Parties", value: "parties" },
  { name: "NPPs", value: "npps" },
  { name: "Map / Geography", value: "map_geo" },
  { name: "Diplomacy", value: "diplomacy" },
  { name: "Onboarding / Account", value: "onboarding_account" },
  { name: "Notifications", value: "notifications" },
  { name: "Other / Meta", value: "meta_other" },
] as const;

export const data = new SlashCommandBuilder()
  .setName("suggest")
  .setDescription("Submit a suggestion to the A House Divided team")
  .addStringOption((o) =>
    o
      .setName("category")
      .setDescription("Type of suggestion")
      .setRequired(true)
      .addChoices(...CATEGORY_CHOICES)
  )
  .addStringOption((o) =>
    o
      .setName("system")
      .setDescription("Which part of the game does this relate to?")
      .setRequired(true)
      .addChoices(...GAME_SYSTEM_CHOICES)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const category = interaction.options.getString("category", true);
  const gameSystem = interaction.options.getString("system", true);

  const modal = new ModalBuilder()
    .setCustomId(`suggest_modal_${category}_${gameSystem}`)
    .setTitle("Submit a Suggestion");

  const titleInput = new TextInputBuilder()
    .setCustomId("suggest_title")
    .setLabel("Title")
    .setPlaceholder("Brief summary of your suggestion")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(200)
    .setRequired(true);

  const descriptionInput = new TextInputBuilder()
    .setCustomId("suggest_description")
    .setLabel("Description")
    .setPlaceholder("Describe your suggestion in detail…")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(2000)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
  );

  await interaction.showModal(modal);
}

export const SUGGEST_MODAL_PREFIX = "suggest_modal_";

/** Handle the modal submission — called from index.ts interactionCreate. */
export async function handleSuggestModal(interaction: import("discord.js").ModalSubmitInteraction) {
  // Parse category + gameSystem out of the customId
  const payload = interaction.customId.slice(SUGGEST_MODAL_PREFIX.length);
  const underscoreIdx = payload.indexOf("_");
  // category values use underscores too, so split on the known game system values
  // customId format: suggest_modal_{category}_{gameSystem}
  // We encoded them as `${category}_${gameSystem}` — walk the game systems to find the split
  const GAME_SYSTEM_VALUES = [
    "elections", "legislature", "executive", "judiciary", "economy",
    "corporations", "parties", "npps", "map_geo", "combat_or_military",
    "diplomacy", "onboarding_account", "notifications", "meta_other",
  ];

  let category = "";
  let gameSystem = "";
  for (const gs of GAME_SYSTEM_VALUES) {
    if (payload.endsWith(`_${gs}`)) {
      gameSystem = gs;
      category = payload.slice(0, payload.length - gs.length - 1);
      break;
    }
  }

  if (!category || !gameSystem) {
    await interaction.reply({ content: "Something went wrong parsing your suggestion. Please try again.", ephemeral: true });
    return;
  }

  const title = interaction.fields.getTextInputValue("suggest_title").trim();
  const description = interaction.fields.getTextInputValue("suggest_description").trim();

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await postDiscordSuggestion({
      title,
      description,
      category,
      gameSystem,
      discordUserId: interaction.user.id,
      discordUsername: interaction.user.username,
    });

    const embed = new EmbedBuilder()
      .setTitle(`✅ Suggestion S#${result.issueNumber} submitted!`)
      .setColor(0x9b59b6)
      .setDescription(`**${title}**\n\n${description.slice(0, 300)}${description.length > 300 ? "…" : ""}`)
      .addFields({ name: "View on site", value: result.detailUrl })
      .setFooter({ text: "A House Divided — player suggestions" });

    await interaction.editReply({ embeds: [embed] });
  } catch {
    await interaction.editReply({ content: "Failed to submit your suggestion. Please try again later." });
  }
}
