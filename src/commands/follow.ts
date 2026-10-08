import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { getAutocomplete } from "../utils/api.js";
import { respondCountryAutocomplete } from "../utils/countryChoices.js";
import { standardFooter } from "../utils/helpers.js";
import { describe, followTargetChoices, removeTarget } from "../utils/followTargets.js";
import {
  addFollow,
  getPrefs,
  resolveDefaults,
  MAX_FOLLOWS,
  type Follow,
} from "../utils/userPrefsStore.js";

export const cooldown = 3;

export const data = new SlashCommandBuilder()
  .setName("follow")
  .setDescription("Follow politicians and parties for DM updates (enable in /settings)")
  .addSubcommand((s) =>
    s
      .setName("politician")
      .setDescription("Follow a politician")
      .addStringOption((o) => o.setName("name").setDescription("Character name").setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("party")
      .setDescription("Follow a party")
      .addStringOption((o) => o.setName("id").setDescription("Party ID number").setRequired(true))
      .addStringOption((o) =>
        o.setName("country").setDescription("Country (defaults to your default country)").setRequired(false).setAutocomplete(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Stop following a politician or party")
      .addStringOption((o) => o.setName("target").setDescription("Politician name or party id:country").setRequired(true).setAutocomplete(true)),
  )
  .addSubcommand((s) => s.setName("list").setDescription("Show everything you follow"));

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name === "country") {
    await respondCountryAutocomplete(interaction);
    return;
  }
  if (focused.name === "target") {
    await interaction.respond(followTargetChoices(interaction.user.id, focused.value));
    return;
  }
  try {
    const res = await getAutocomplete({ type: "characters", q: focused.value, limit: 25 });
    await interaction.respond(res.results.map((r) => ({ name: r.name, value: r.name })));
  } catch {
    await interaction.respond([]);
  }
}

async function reply(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function doAdd(interaction: ChatInputCommandInteraction, follow: Follow): Promise<void> {
  const res = addFollow(interaction.user.id, follow);
  if (res === "exists") return reply(interaction, `You already follow that. (${describe(follow)})`);
  if (res === "full") return reply(interaction, `You can follow at most ${MAX_FOLLOWS}. Remove one first.`);
  const note = getPrefs(interaction.user.id).notifyFollows ? "" : " Turn on follow DMs in `/settings` to get updates.";
  await reply(interaction, `Now following ${describe(follow)}.${note}`);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  if (sub === "politician") {
    return doAdd(interaction, { kind: "politician", name: interaction.options.getString("name", true).trim() });
  }
  if (sub === "party") {
    const country = interaction.options.getString("country") ?? resolveDefaults(interaction.user.id).country;
    if (!country) return reply(interaction, "Pick a country, or set a default one in `/settings`.");
    return doAdd(interaction, { kind: "party", id: interaction.options.getString("id", true).trim(), country: country.toUpperCase() });
  }
  if (sub === "remove") return reply(interaction, removeTarget(interaction.user.id, interaction.options.getString("target", true)));

  const follows = getPrefs(interaction.user.id).follows;
  const embed = new EmbedBuilder()
    .setTitle("Following")
    .setColor(resolveDefaults(interaction.user.id).accentColor ?? 0x5865f2)
    .setDescription(follows.length ? follows.map((f) => `- ${describe(f)}`).join("\n").slice(0, 4000) : "You are not following anyone yet. Use `/follow politician` or `/follow party`.")
    .setFooter(standardFooter(`${follows.length}/${MAX_FOLLOWS}`));
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
