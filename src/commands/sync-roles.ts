import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { lookupByDiscordId } from "../utils/api.js";
import { syncMemberRoles } from "../utils/roles.js";

export const cooldown = 30;

export const data = new SlashCommandBuilder()
  .setName("sync-roles")
  .setDescription("Backfill party and country roles for all linked members (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: "This command must be used in a server." });
    return;
  }

  await interaction.editReply({ content: "Fetching members…" });

  try {
    const members = await guild.members.fetch();
    const humans = [...members.values()].filter((m) => !m.user.bot);

    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const member of humans) {
      try {
        const result = await lookupByDiscordId(member.id);
        if (result.found && result.characters.length > 0) {
          await syncMemberRoles(member, result.characters[0]);
          synced++;
        } else {
          skipped++;
        }
      } catch {
        failed++;
      }

      // Avoid hammering the API
      await new Promise((r) => setTimeout(r, 250));
    }

    await interaction.editReply({
      content: `Done. **${synced}** synced · **${skipped}** no linked account · **${failed}** errors — out of ${humans.length} members.`,
    });
  } catch (error) {
    console.error("sync-roles error:", error);
    await interaction.editReply({ content: "Failed to fetch members. Check bot permissions." });
  }
}
