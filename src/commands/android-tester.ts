import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
  parseEmoji,
} from "discord.js";
import { setBinding } from "../utils/reactionRoleStore.js";
import { replyWithError } from "../utils/helpers.js";

const NEUTRAL_COLOR = 0x5865f2;
const DEFAULT_EMOJI = "✅";

async function fail(interaction: ChatInputCommandInteraction, msg: string): Promise<void> {
  const body = { content: msg, ephemeral: true } as const;
  if (interaction.deferred || interaction.replied) await interaction.editReply({ content: msg });
  else await interaction.reply(body);
}

export const data = new SlashCommandBuilder()
  .setName("android-tester")
  .setDescription("Post a message that grants the Android tester role when people react (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setDMPermission(false)
  .addStringOption((opt) =>
    opt.setName("message").setDescription("The announcement text to post").setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("emoji").setDescription("Reaction to grant the role (default ✅)").setRequired(false),
  )
  .addRoleOption((opt) =>
    opt.setName("role").setDescription("Role to grant (default: the Android tester role)").setRequired(false),
  )
  .addBooleanOption((opt) =>
    opt
      .setName("remove_on_unreact")
      .setDescription("Also remove the role when someone removes their reaction (default: no)")
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await fail(interaction, "This command can only be used in a server.");
    return;
  }

  const message = interaction.options.getString("message", true);
  const emojiInput = interaction.options.getString("emoji") ?? DEFAULT_EMOJI;
  const role =
    interaction.options.getRole("role") ??
    (process.env.ANDROID_TESTER_ROLE_ID
      ? interaction.guild.roles.cache.get(process.env.ANDROID_TESTER_ROLE_ID)
      : null);
  const removeOnUnreact = interaction.options.getBoolean("remove_on_unreact") ?? false;

  if (!role) {
    await fail(interaction, "No role to grant. Pass a `role`, or set `ANDROID_TESTER_ROLE_ID` in the bot's environment.");
    return;
  }

  // The bot can only assign a role positioned below its own highest role.
  const me = await interaction.guild.members.fetchMe();
  if (role.position >= me.roles.highest.position) {
    await fail(interaction, `I cannot assign **${role.name}** because it is not below my highest role. Move my bot role above it in Server Settings, then try again.`);
    return;
  }

  // Resolve the reaction emoji: a unicode char, or a custom <:name:id> / :id.
  const parsed = parseEmoji(emojiInput);
  const reactWith = parsed?.id ? `${parsed.name}:${parsed.id}` : emojiInput;
  const storedEmoji = parsed?.id ?? emojiInput;

  const channel = interaction.channel;
  if (!channel || !(channel instanceof TextChannel)) {
    await fail(interaction, "I can only post in a standard text channel.");
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(NEUTRAL_COLOR)
    .setDescription(message)
    .setFooter({ text: `React with ${emojiInput} to get the ${role.name} role` });

  await interaction.deferReply({ ephemeral: true });

  let posted;
  try {
    posted = await channel.send({ embeds: [embed] });
    await posted.react(reactWith);
  } catch (err) {
    await fail(interaction, `Could not post or react: ${(err as Error).message}. Check that the emoji is one I can use.`);
    return;
  }

  setBinding(posted.id, {
    guildId: interaction.guild.id,
    channelId: channel.id,
    roleId: role.id,
    emoji: storedEmoji,
    removeOnUnreact,
  });

  await interaction.editReply(
    `Posted. Anyone who reacts with ${emojiInput} now gets **${role.name}** automatically` +
      (removeOnUnreact ? ", and loses it if they remove the reaction." : ". Removing the reaction keeps the role."),
  );
}
