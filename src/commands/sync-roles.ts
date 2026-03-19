import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { getSyncRoles } from "../utils/api.js";
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
    let processed = 0;
    const CONCURRENCY = 5;

    // Process members in parallel batches
    for (let i = 0; i < humans.length; i += CONCURRENCY) {
      const batch = humans.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (member) => {
          const result = await getSyncRoles(member.id);
          if (result.found && result.roles.length > 0) {
            await syncMemberRoles(member, result.roles, result.details);
            return "synced" as const;
          }
          return "skipped" as const;
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value === "synced") synced++;
          else skipped++;
        } else {
          failed++;
        }
      }

      processed += batch.length;
      if (processed % 25 === 0 || processed === humans.length) {
        await interaction.editReply({
          content: `Syncing… ${processed}/${humans.length} processed.`,
        }).catch(() => {});
      }
    }

    await interaction.editReply({
      content: `Done. **${synced}** synced · **${skipped}** no linked account · **${failed}** errors — out of ${humans.length} members.`,
    });
  } catch (error) {
    console.error("sync-roles error:", error);
    await interaction.editReply({ content: "Failed to fetch members. Check bot permissions." });
  }
}
