import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from "discord.js";
import { fetchLiveCountries } from "../utils/countryChoices.js";
import { standardFooter } from "../utils/helpers.js";
import { COUNTRY_NAMES } from "../utils/formatting.js";
import {
  ACCENT_PALETTE,
  getPrefs,
  updatePrefs,
  resetPrefs,
  isAccentKey,
  type UserPrefs,
} from "../utils/userPrefsStore.js";
import { handleComponent as handleMeComponent } from "./me.js";

export const cooldown = 3;

/** Every component id owned by this module starts with this. */
export const PREFS_PREFIX = "prefs_";

const ID = {
  country: "prefs_country",
  accent: "prefs_accent",
  togglePrivate: "prefs_toggle_private",
  toggleFormat: "prefs_toggle_format",
  toggleTurn: "prefs_toggle_turn",
  toggleFollows: "prefs_toggle_follows",
  politician: "prefs_politician",
  politicianModal: "prefs_modal_politician",
  reset: "prefs_reset",
} as const;

const NONE = "__none__";

export const data = new SlashCommandBuilder()
  .setName("settings")
  .setDescription("View and change your personal bot settings");

const onOff = (v: boolean) => (v ? "On" : "Off");

function countryLabel(code: string | null): string {
  if (!code) return "Not set";
  return COUNTRY_NAMES[code] ? `${COUNTRY_NAMES[code]} (${code})` : code;
}

export function buildSettingsEmbed(prefs: UserPrefs): EmbedBuilder {
  const accent = prefs.accent ? ACCENT_PALETTE[prefs.accent] : null;
  return new EmbedBuilder()
    .setTitle("Your settings")
    .setColor(accent?.color ?? 0x5865f2)
    .setDescription("Change anything below. Only you can see this.")
    .addFields(
      { name: "Default country", value: countryLabel(prefs.defaultCountry), inline: true },
      { name: "Default politician", value: prefs.defaultPolitician ?? "Not set", inline: true },
      { name: "Private replies", value: onOff(prefs.privateReplies), inline: true },
      { name: "Number format", value: prefs.numberFormat === "full" ? "Full (1,234,567)" : "Compact (1.2M)", inline: true },
      { name: "Accent colour", value: accent?.label ?? "Default", inline: true },
      { name: "Follows", value: `${prefs.follows.length} (manage with /follow)`, inline: true },
      { name: "DM: turn processed", value: onOff(prefs.notifyTurn), inline: true },
      { name: "DM: follow updates", value: onOff(prefs.notifyFollows), inline: true },
    )
    .setFooter(standardFooter());
}

export async function buildSettingsComponents(prefs: UserPrefs): Promise<ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[]> {
  const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

  const countries = await fetchLiveCountries("");
  if (countries.length > 0) {
    const options = [
      { label: "No default", value: NONE, default: !prefs.defaultCountry },
      ...countries.slice(0, 24).map((c) => ({
        label: c.name.slice(0, 100),
        value: c.id,
        default: c.id === prefs.defaultCountry,
      })),
    ];
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(ID.country).setPlaceholder("Default country").addOptions(options),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(ID.accent)
        .setPlaceholder("Accent colour")
        .addOptions([
          { label: "Default", value: NONE, default: !prefs.accent },
          ...Object.entries(ACCENT_PALETTE).map(([key, v]) => ({
            label: v.label,
            value: key,
            default: key === prefs.accent,
          })),
        ]),
    ),
  );

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ID.togglePrivate).setLabel(`Private replies: ${onOff(prefs.privateReplies)}`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ID.toggleFormat).setLabel(`Numbers: ${prefs.numberFormat === "full" ? "Full" : "Compact"}`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ID.toggleTurn).setLabel(`Turn DMs: ${onOff(prefs.notifyTurn)}`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ID.toggleFollows).setLabel(`Follow DMs: ${onOff(prefs.notifyFollows)}`).setStyle(ButtonStyle.Secondary),
    ),
  );
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ID.politician).setLabel("Set default politician").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(ID.reset).setLabel("Reset all").setStyle(ButtonStyle.Danger),
    ),
  );
  return rows;
}

async function render(userId: string) {
  const prefs = getPrefs(userId);
  return { embeds: [buildSettingsEmbed(prefs)], components: await buildSettingsComponents(prefs) };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // Settings are always ephemeral, regardless of the private-replies preference.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await interaction.editReply(await render(interaction.user.id));
}

/**
 * Entry point for every component/modal interaction whose customId starts with
 * `prefs_`. Returns without replying for ids it does not own.
 */
export async function handleComponent(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
): Promise<void> {
  const id = interaction.customId;
  if (!id.startsWith(PREFS_PREFIX)) return;
  const userId = interaction.user.id;

  if (id.startsWith("prefs_me_") && interaction.isButton()) {
    await handleMeComponent(interaction);
    return;
  }

  if (interaction.isModalSubmit()) {
    if (id !== ID.politicianModal) return;
    const raw = interaction.fields.getTextInputValue("name").trim().slice(0, 100);
    updatePrefs(userId, { defaultPolitician: raw || null });
    if (interaction.isFromMessage()) {
      await interaction.update(await render(userId));
    } else {
      await interaction.reply({ ...(await render(userId)), flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (interaction.isButton()) {
    const prefs = getPrefs(userId);
    if (id === ID.politician) {
      const modal = new ModalBuilder().setCustomId(ID.politicianModal).setTitle("Default politician");
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("name")
            .setLabel("Character name (blank to clear)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(100)
            .setValue(prefs.defaultPolitician ?? ""),
        ),
      );
      await interaction.showModal(modal);
      return;
    }
    if (id === ID.togglePrivate) updatePrefs(userId, { privateReplies: !prefs.privateReplies });
    else if (id === ID.toggleFormat) updatePrefs(userId, { numberFormat: prefs.numberFormat === "full" ? "compact" : "full" });
    else if (id === ID.toggleTurn) updatePrefs(userId, { notifyTurn: !prefs.notifyTurn });
    else if (id === ID.toggleFollows) updatePrefs(userId, { notifyFollows: !prefs.notifyFollows });
    else if (id === ID.reset) resetPrefs(userId);
    else return;
    await interaction.update(await render(userId));
    return;
  }

  if (interaction.isStringSelectMenu()) {
    const value = interaction.values[0];
    if (id === ID.country) updatePrefs(userId, { defaultCountry: value === NONE ? null : value });
    else if (id === ID.accent) updatePrefs(userId, { accent: isAccentKey(value) ? value : null });
    else return;
    await interaction.update(await render(userId));
  }
}

