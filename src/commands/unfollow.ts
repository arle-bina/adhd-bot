import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction, MessageFlags } from "discord.js";
import { followTargetChoices, removeTarget } from "../utils/followTargets.js";

export const cooldown = 3;

export const data = new SlashCommandBuilder()
  .setName("unfollow")
  .setDescription("Stop following a politician or party")
  .addStringOption((o) =>
    o.setName("target").setDescription("Politician name or party id:country").setRequired(true).setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await interaction.respond(followTargetChoices(interaction.user.id, interaction.options.getFocused()));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const content = removeTarget(interaction.user.id, interaction.options.getString("target", true));
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
