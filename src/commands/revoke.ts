import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { fetchGrants, postRevoke, isLakesideConfigured } from "../utils/api-lakeside.js";
import { grantChoices } from "../utils/grantChoices.js";
import { replyWithError, standardFooter } from "../utils/helpers.js";

const OK_COLOR = 0x57f287;
const ERROR_COLOR = 0xed4245;

export const data = new SlashCommandBuilder()
  .setName("revoke")
  .setDescription("Take back access given through the Lakeside account service (owner and cofounder only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addStringOption((opt) =>
    opt
      .setName("grant")
      .setDescription("Which grant to revoke (pick the user first to narrow the list)")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addUserOption((opt) =>
    opt.setName("user").setDescription("Discord user who holds the grant").setRequired(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!isLakesideConfigured()) {
    await interaction.respond([]);
    return;
  }
  const typed = interaction.options.getFocused().toLowerCase();
  // The user option may not be filled yet; fall back to every active grant.
  const userId = interaction.options.get("user")?.value;
  const result = await fetchGrants(interaction.user.id, typeof userId === "string" ? userId : undefined);
  if (!result.ok) {
    await interaction.respond([]);
    return;
  }
  const choices = grantChoices(result.data.grants).filter((c) => !typed || c.name.toLowerCase().includes(typed));
  await interaction.respond(choices.slice(0, 25));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isLakesideConfigured()) {
    await interaction.reply({ content: "Lakeside grants are not configured on this bot.", ephemeral: true });
    return;
  }

  const grantRef = interaction.options.getString("grant", true);
  const target = interaction.options.getUser("user", true);

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await postRevoke(interaction.user.id, grantRef);
    if (!result.ok) {
      const embed = new EmbedBuilder()
        .setTitle("/revoke")
        .setColor(ERROR_COLOR)
        .setDescription(result.message)
        .setFooter(standardFooter());
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const label = result.data.grant?.label ?? result.data.grant?.productLabel ?? "that grant";
    const embed = new EmbedBuilder()
      .setTitle("Access revoked")
      .setColor(OK_COLOR)
      .setDescription(`Revoked ${label} for <@${target.id}>.`)
      .setFooter(standardFooter());
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "revoke", error);
  }
}
