import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from "discord.js";
import { getCommodities } from "../utils/api-features.js";
import { respondCountryAutocomplete } from "../utils/countryChoices.js";
import { parseCommodityKey, parseCountryCode } from "../utils/featureFormat.js";
import { buildCommodityDetail, buildCommodityList } from "../utils/featureViews.js";
import { replyWithError } from "../utils/helpers.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("commodity")
  .setDescription("Commodity prices, supply and demand")
  .addStringOption((o) => o.setName("key").setDescription("Commodity (omit for the full list)").setAutocomplete(true))
  .addStringOption((o) => o.setName("country").setDescription("Show national figures for a country").setAutocomplete(true));

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name === "country") {
    await respondCountryAutocomplete(interaction);
    return;
  }
  try {
    const needle = focused.value.toLowerCase();
    const { commodities } = await getCommodities();
    await interaction.respond(
      commodities
        .filter((c) => c.label.toLowerCase().includes(needle) || c.key.includes(needle))
        .slice(0, 25)
        .map((c) => ({ name: c.label, value: c.key })),
    );
  } catch {
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  try {
    const country = parseCountryCode(interaction.options.getString("country")) ?? undefined;
    const rawKey = interaction.options.getString("key");
    const key = parseCommodityKey(rawKey);
    if (rawKey && !key) {
      await interaction.editReply({ content: "That is not a valid commodity key." });
      return;
    }
    await interaction.editReply(key ? await buildCommodityDetail(key, country) : await buildCommodityList(country));
  } catch (error) {
    await replyWithError(interaction, "commodity", error);
  }
}
