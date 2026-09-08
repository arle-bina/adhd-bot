import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import {
  postTempSpAccess,
  type TempSpAccessResponse,
} from "../utils/api-politics.js";
import { ApiError } from "../utils/api-base.js";
import { replyWithError, standardFooter } from "../utils/helpers.js";

const OK_COLOR = 0x57f287;
const ERROR_COLOR = 0xed4245;
const NEUTRAL_COLOR = 0x5865f2;
const DEFAULT_DAYS = 30;

function unixSeconds(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

function notFoundMessage(error: ApiError): string {
  try {
    const body = JSON.parse(error.responseBody) as { message?: string };
    if (typeof body.message === "string" && body.message.length > 0)
      return body.message;
  } catch {
    // body was not JSON
  }
  return "No linked game account for that Discord user. They need to link Discord in Settings first.";
}

function resultEmbed(
  userId: string,
  result: TempSpAccessResponse,
): EmbedBuilder {
  const mention = `<@${userId}>`;
  if (result.alreadyPermanent) {
    return new EmbedBuilder()
      .setTitle("Singleplayer access")
      .setColor(NEUTRAL_COLOR)
      .setDescription(
        `${mention} already has permanent singleplayer access. Nothing changed.`,
      )
      .setFooter(standardFooter());
  }

  if (!result.extended && result.expiresAt) {
    const ts = unixSeconds(result.expiresAt);
    return new EmbedBuilder()
      .setTitle("Singleplayer access")
      .setColor(NEUTRAL_COLOR)
      .setDescription(
        `${mention} already has limited singleplayer access until <t:${ts}:F> (<t:${ts}:R>). Left it in place.`,
      )
      .setFooter(standardFooter());
  }

  const ts = result.expiresAt ? unixSeconds(result.expiresAt) : null;
  const embed = new EmbedBuilder()
    .setTitle("Temporary singleplayer access granted")
    .setColor(OK_COLOR)
    .setDescription(
      `Granted **${result.days}-day** limited singleplayer access to ${mention}.`,
    )
    .addFields(
      {
        name: "Account",
        value: result.username || result.characterName || "Linked account",
        inline: true,
      },
      {
        name: "Expires",
        value: ts ? `<t:${ts}:F> (<t:${ts}:R>)` : "unknown",
        inline: true,
      },
    )
    .setFooter(standardFooter());

  if (
    result.characterName &&
    result.username &&
    result.characterName !== result.username
  ) {
    embed.addFields({
      name: "Character",
      value: result.characterName,
      inline: true,
    });
  }
  return embed;
}

export const data = new SlashCommandBuilder()
  .setName("temp-sp-access")
  .setDescription(
    "Grant a tagged user limited (time-limited) singleplayer access (admin only)",
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setDMPermission(false)
  .addUserOption((opt) =>
    opt
      .setName("user")
      .setDescription("Discord user to grant access to")
      .setRequired(true),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("days")
      .setDescription(
        `How many days of access (default ${DEFAULT_DAYS}, max 90)`,
      )
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(90),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "This command can only be used inside a server.",
      ephemeral: true,
    });
    return;
  }

  const target = interaction.options.getUser("user", true);
  const days = interaction.options.getInteger("days") ?? DEFAULT_DAYS;

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await postTempSpAccess({
      discordId: target.id,
      days,
      grantedBy: interaction.user.tag,
    });

    if (!result.found) {
      const embed = new EmbedBuilder()
        .setTitle("Singleplayer access")
        .setColor(ERROR_COLOR)
        .setDescription(
          result.message ||
            `No linked game account for ${target}. They need to link Discord in Settings first.`,
        )
        .setFooter(standardFooter());
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    await interaction.editReply({ embeds: [resultEmbed(target.id, result)] });

    if (result.extended && result.expiresAt) {
      const ts = unixSeconds(result.expiresAt);
      try {
        await target.send(
          `Staff granted you **${result.days} days** of A House Divided singleplayer access. Sign in to the desktop client with this Discord account. Access expires <t:${ts}:F> (<t:${ts}:R>).`,
        );
      } catch {
        await interaction.followUp({
          content: `Could not DM ${target}. Grant is still active.`,
          ephemeral: true,
        });
      }
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      const embed = new EmbedBuilder()
        .setTitle("Singleplayer access")
        .setColor(ERROR_COLOR)
        .setDescription(notFoundMessage(error))
        .setFooter(standardFooter());
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    await replyWithError(interaction, "temp-sp-access", error);
  }
}
