import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from "discord.js";
import { respondCountryAutocomplete, validateCountry } from "../utils/countryChoices.js";
import { parseCountryCode, isCountryTab, type CountryTab } from "../utils/featureFormat.js";
import { buildCountryView } from "../utils/featureViews.js";
import { replyWithError } from "../utils/helpers.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("country")
  .setDescription("Country dashboard: economy, legislature and budget")
  .addStringOption((o) => o.setName("code").setDescription("Country").setRequired(true).setAutocomplete(true))
  .addStringOption((o) =>
    o
      .setName("tab")
      .setDescription("Starting tab (default overview)")
      .addChoices(
        { name: "Overview", value: "overview" },
        { name: "Economy", value: "economy" },
        { name: "Legislature", value: "legislature" },
        { name: "Budget", value: "budget" },
      ),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await respondCountryAutocomplete(interaction);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const code = parseCountryCode(interaction.options.getString("code", true));
  if (!code) {
    await interaction.reply({ content: "Give a country code such as US or UK.", ephemeral: true });
    return;
  }
  await interaction.deferReply();
  try {
    const check = await validateCountry(code);
    if (!check.ok) {
      await interaction.editReply({ content: check.message });
      return;
    }
    const raw = interaction.options.getString("tab") ?? "overview";
    const tab: CountryTab = isCountryTab(raw) ? raw : "overview";
    await interaction.editReply(await buildCountryView(tab, code));
  } catch (error) {
    await replyWithError(interaction, "country", error);
  }
}
