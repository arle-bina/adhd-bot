import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} from "discord.js";
import { categories, extras, STAFF_BY_CONVENTION, type Category } from "../utils/helpRegistry.js";
import {
  canSee,
  getCatalogSync,
  loadCatalog,
  usageLines,
  type CatalogCommand,
} from "../utils/commandCatalog.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Browse bot commands, or get details for one")
  .addStringOption((o) =>
    o
      .setName("command")
      .setDescription("Show details for one command, e.g. party")
      .setRequired(false)
      .setAutocomplete(true),
  );

export type Perms = { has(bits: bigint): boolean } | null | undefined;

const FIELD_MAX = 1024;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Visible to this member: passes the Discord permission gate and the staff convention. */
export function isVisible(cmd: CatalogCommand, perms: Perms): boolean {
  if (!canSee(cmd, perms)) return false;
  if (STAFF_BY_CONVENTION.has(cmd.name)) return !!perms?.has(PermissionFlagsBits.ManageMessages);
  return true;
}

interface ResolvedCategory {
  category: Category;
  commands: CatalogCommand[];
}

function resolveCategories(perms: Perms): ResolvedCategory[] | null {
  const catalog = getCatalogSync();
  if (!catalog) return null;
  const byName = new Map(catalog.map((c) => [c.name, c]));
  return categories
    .map((category) => ({
      category,
      commands: category.commands
        .map((n) => byName.get(n))
        .filter((c): c is CatalogCommand => !!c && isVisible(c, perms)),
    }))
    .filter((r) => r.commands.length > 0);
}

export function buildOverviewEmbed(perms?: Perms): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📖  A House Divided: Commands")
    .setColor(0x5865f2)
    .setDescription(
      "Your companion for **A House Divided**, a political simulation. Pick a category below, or run `/help command:<name>` for one command.",
    )
    .setFooter({ text: "ahousedividedgame.com" });

  const resolved = resolveCategories(perms);
  if (!resolved) {
    embed.addFields({ name: "Loading", value: "Command list is still loading. Try again in a moment." });
    return embed;
  }
  for (const { category, commands } of resolved) {
    embed.addFields({
      name: `${category.emoji}  ${category.label}`,
      value: clip(
        `${category.description}\n${commands.map((c) => `\`/${c.name}\``).join("  ·  ")}`,
        FIELD_MAX,
      ),
      inline: false,
    });
  }
  return embed;
}

function commandField(cmd: CatalogCommand): { name: string; value: string } {
  const ex = extras[cmd.name];
  const parts = [cmd.description];
  if (ex?.details) parts.push(ex.details);
  if (ex?.examples.length) parts.push(`**Examples**\n${ex.examples.map((e) => `\`${e}\``).join("\n")}`);
  return {
    name: clip(usageLines(cmd)[0], 256),
    value: clip(parts.join("\n\n"), FIELD_MAX),
  };
}

export function buildCategoryEmbed(categoryLabel: string, perms?: Perms): EmbedBuilder | null {
  const resolved = resolveCategories(perms);
  if (!resolved) return null;
  const hit = resolved.find((r) => r.category.label === categoryLabel);
  if (!hit) return null;
  const { category, commands } = hit;

  const embed = new EmbedBuilder()
    .setTitle(`${category.emoji}  ${category.label}`)
    .setColor(category.color)
    .setDescription(category.description)
    .setFooter({ text: "ahousedividedgame.com  ·  /help command:<name> for full options" });
  // Embeds cap at 25 fields.
  for (const cmd of commands.slice(0, 25)) embed.addFields({ ...commandField(cmd), inline: false });
  return embed;
}

export function buildCommandEmbed(name: string, perms?: Perms): EmbedBuilder | null {
  const catalog = getCatalogSync();
  const cmd = catalog?.find((c) => c.name === name.replace(/^\//, "").toLowerCase());
  if (!cmd || !isVisible(cmd, perms)) return null;
  const ex = extras[cmd.name];
  const cat = categories.find((c) => c.commands.includes(cmd.name));

  const embed = new EmbedBuilder()
    .setTitle(`/${cmd.name}`)
    .setColor(cat?.color ?? 0x5865f2)
    .setDescription(clip([cmd.description, ex?.details].filter(Boolean).join("\n\n"), 4000))
    .addFields({ name: "Usage", value: clip(usageLines(cmd).map((l) => `\`${l}\``).join("\n"), FIELD_MAX) })
    .setFooter({ text: "<required>  [optional]  ·  ahousedividedgame.com" });

  const fmtOpt = (o: CatalogCommand["options"][number], prefix = "") => {
    const choices = o.choices.length ? ` (${clip(o.choices.join(", "), 120)})` : "";
    return `${prefix}\`${o.name}\` ${o.required ? "required" : "optional"} ${o.type}: ${o.description}${choices}`;
  };
  if (cmd.options.length) {
    embed.addFields({ name: "Options", value: clip(cmd.options.map((o) => fmtOpt(o)).join("\n"), FIELD_MAX) });
  }
  if (cmd.subcommands.length) {
    const lines = cmd.subcommands.map((s) => {
      const opts = s.options.map((o) => fmtOpt(o, "  ")).join("\n");
      return `**${s.name}**: ${s.description}${opts ? `\n${opts}` : ""}`;
    });
    embed.addFields({ name: "Subcommands", value: clip(lines.join("\n"), FIELD_MAX) });
  }
  if (ex?.examples.length) {
    embed.addFields({ name: "Examples", value: clip(ex.examples.map((e) => `\`${e}\``).join("\n"), FIELD_MAX) });
  }
  return embed;
}

export function buildSelectMenu(perms?: Perms): ActionRowBuilder<StringSelectMenuBuilder> {
  const resolved = resolveCategories(perms) ?? [];
  const menu = new StringSelectMenuBuilder()
    .setCustomId("help_category")
    .setPlaceholder("Choose a category…")
    .addOptions(
      resolved.map(({ category }) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(category.label)
          .setEmoji(category.emoji)
          .setDescription(clip(category.description, 100))
          .setValue(category.label),
      ),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const catalog = await loadCatalog();
  const needle = interaction.options.getFocused().toLowerCase().replace(/^\//, "");
  const perms = interaction.memberPermissions;
  const visible = catalog.filter((c) => isVisible(c, perms) && c.name.includes(needle));
  visible.sort((a, b) => Number(b.name.startsWith(needle)) - Number(a.name.startsWith(needle)) || a.name.localeCompare(b.name));
  await interaction.respond(
    visible.slice(0, 25).map((c) => ({ name: clip(`/${c.name}: ${c.description}`, 100), value: c.name })),
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await loadCatalog();
  const perms = interaction.memberPermissions;
  const wanted = interaction.options.getString("command");

  if (wanted) {
    const embed = buildCommandEmbed(wanted, perms);
    await interaction.reply(
      embed
        ? { embeds: [embed], ephemeral: true }
        : { content: `No command named \`${wanted}\`. Run \`/help\` to browse them all.`, ephemeral: true },
    );
    return;
  }

  await interaction.reply({
    embeds: [buildOverviewEmbed(perms)],
    components: [buildSelectMenu(perms)],
    ephemeral: true,
  });
}

// Warm the catalog at startup so select-menu clicks after a restart still resolve.
if (!process.env.VITEST) void loadCatalog().catch(() => undefined);
