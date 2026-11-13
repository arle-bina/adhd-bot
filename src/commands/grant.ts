import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { fetchCatalogChoices, postGrant, isLakesideConfigured } from "../utils/api-lakeside.js";
import { decodeChoice, filterChoices } from "../utils/grantChoices.js";
import { replyWithError, standardFooter } from "../utils/helpers.js";

const OK_COLOR = 0x57f287;
const ERROR_COLOR = 0xed4245;
const ACCOUNT_URL = "https://lakesidegames.net/account";

export const data = new SlashCommandBuilder()
  .setName("grant")
  .setDescription("Give a player paid access through the Lakeside account service (owner and cofounder only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addUserOption((opt) =>
    opt.setName("user").setDescription("Discord user to give access to").setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("product")
      .setDescription("What to give")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("expires")
      .setDescription("Days until the access ends (leave empty for no end date)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(3650),
  )
  .addStringOption((opt) =>
    opt
      .setName("reason")
      .setDescription("Why you are granting this")
      .setRequired(false)
      .setMaxLength(300),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!isLakesideConfigured()) {
    await interaction.respond([]);
    return;
  }
  const typed = interaction.options.getFocused();
  const result = await fetchCatalogChoices(interaction.user.id);
  await interaction.respond(result.ok ? filterChoices(result.data, typed) : []);
}

function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("/grant")
    .setColor(ERROR_COLOR)
    .setDescription(message.slice(0, 4096))
    .setFooter(standardFooter());
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isLakesideConfigured()) {
    await interaction.reply({ content: "Lakeside grants are not configured on this bot.", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("user", true);
  const choice = decodeChoice(interaction.options.getString("product", true));
  if (!choice) {
    await interaction.reply({ content: "Pick a product from the list.", ephemeral: true });
    return;
  }
  const expires = interaction.options.getInteger("expires") ?? undefined;
  const reason =
    interaction.options.getString("reason")?.trim() || `Granted in Discord by ${interaction.user.tag}`;

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await postGrant({
      actorDiscordId: interaction.user.id,
      targetDiscordId: target.id,
      scope: choice.scope,
      productId: choice.productId,
      expiresDays: expires,
      reason,
    });

    if (!result.ok) {
      await interaction.editReply({ embeds: [errorEmbed(result.message)] });
      return;
    }

    const { grant, summary } = result.data;
    const what = grant.label ?? grant.productLabel ?? "access to a Lakeside product";

    let dmNote = "";
    try {
      await target.send(
        `Lakeside Games gave you ${what}. Sign in at ${ACCOUNT_URL} to get it, or open the Lakeside launcher.`,
      );
    } catch {
      dmNote = "\n\nI could not DM them (their DMs are closed). Tell them to sign in at " + ACCOUNT_URL + ".";
    }

    const embed = new EmbedBuilder()
      .setTitle("Access granted")
      .setColor(OK_COLOR)
      .setDescription(`${summary}${dmNote}`.slice(0, 4096))
      .setFooter(standardFooter());
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "grant", error);
  }
}
