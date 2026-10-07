import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from "discord.js";
import { respondCountryAutocomplete } from "../utils/countryChoices.js";
import { parseCountryCode } from "../utils/featureFormat.js";
import { buildWarsView } from "../utils/featureViews.js";
import { replyWithError } from "../utils/helpers.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("wars")
  .setDescription("Active armed conflicts")
  .addStringOption((o) => o.setName("country").setDescription("Only conflicts involving this country").setAutocomplete(true));

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await respondCountryAutocomplete(interaction);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  try {
    const country = parseCountryCode(interaction.options.getString("country")) ?? undefined;
    await interaction.editReply(await buildWarsView(0, country));
  } catch (error) {
    await replyWithError(interaction, "wars", error);
  }
}
