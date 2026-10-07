import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from "discord.js";
import { respondCountryAutocomplete } from "../utils/countryChoices.js";
import { parseCountryCode } from "../utils/featureFormat.js";
import { buildLegislationView, isLegMode, type LegMode } from "../utils/featureViews.js";
import { replyWithError } from "../utils/helpers.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("legislation")
  .setDescription("Recent and pending bills, and referendums")
  .addStringOption((o) => o.setName("country").setDescription("Country").setAutocomplete(true))
  .addStringOption((o) =>
    o
      .setName("view")
      .setDescription("What to show (default pending)")
      .addChoices(
        { name: "Pending bills", value: "pending" },
        { name: "Passed bills", value: "passed" },
        { name: "Failed bills", value: "failed" },
        { name: "Referendums", value: "referendums" },
      ),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await respondCountryAutocomplete(interaction);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  try {
    const country = parseCountryCode(interaction.options.getString("country")) ?? undefined;
    const raw = interaction.options.getString("view") ?? "pending";
    const mode: LegMode = isLegMode(raw) ? raw : "pending";
    await interaction.editReply(await buildLegislationView(mode, 0, country));
  } catch (error) {
    await replyWithError(interaction, "legislation", error);
  }
}
