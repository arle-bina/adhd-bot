import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  GuildMember,
} from "discord.js";
import { getSupporters, type SupporterFeedTier } from "../utils/api.js";
import { getSupporterRoleIds, syncSupporterRole } from "./supporter.js";

const DRY_COLOR = 0x5865f2;
const APPLY_COLOR = 0x57f287;
const ERROR_COLOR = 0xed4245;

// Discord embed field values cap at 1024 chars. Keep list previews well under.
const FIELD_CAP = 1000;
const CONCURRENCY = 5;

// Feed tiers ("supporter" / "supporter-plus") map onto the role tiers that
// syncSupporterRole understands ("regular" / "plus").
function feedTierToRoleTier(tier: SupporterFeedTier): "regular" | "plus" {
  return tier === "supporter-plus" ? "plus" : "regular";
}

export const data = new SlashCommandBuilder()
  .setName("sync-supporters")
  .setDescription("Sync supporter roles from game supporter status (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setDMPermission(false)
  .addBooleanOption((opt) =>
    opt
      .setName("apply")
      .setDescription("Apply changes. Leave off for a dry run that only reports what would change."),
  );

interface Planned {
  // member mention + reason, for the report
  label: string;
  member: GuildMember;
  tier: SupporterFeedTier | null; // null = remove
}

function buildList(items: string[]): string {
  if (items.length === 0) return "None";
  const lines: string[] = [];
  let used = 0;
  let shown = 0;
  for (const item of items) {
    const line = `• ${item}`;
    if (used + line.length + 1 > FIELD_CAP) break;
    lines.push(line);
    used += line.length + 1;
    shown++;
  }
  if (shown < items.length) {
    lines.push(`… and ${items.length - shown} more`);
  }
  return lines.join("\n");
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: "This command can only be used inside a server.",
      ephemeral: true,
    });
    return;
  }

  const apply = interaction.options.getBoolean("apply") ?? false;

  await interaction.deferReply({ ephemeral: true });

  try {
    // 1. Pull the game-side supporter feed.
    const feed = await getSupporters();
    const supporterTierById = new Map<string, SupporterFeedTier>();
    for (const s of feed.supporters) {
      if (s.discordId) supporterTierById.set(s.discordId, s.tier);
    }
    const linkedDiscordIds = new Set(feed.linkedDiscordIds);

    // Supporter role IDs (regular / plus) as configured for this guild.
    const roleIds = await getSupporterRoleIds(interaction.guild.id);
    const supporterRoleIds = [roleIds.regular, roleIds.plus].filter(
      (id): id is string => !!id,
    );

    function memberHasSupporterRole(member: GuildMember): boolean {
      return supporterRoleIds.some((id) => member.roles.cache.has(id));
    }

    // 2. Fetch all guild members.
    await interaction.editReply({ content: "Fetching members…" });
    const members = await interaction.guild.members.fetch();

    // 3. Classify every human member into the three cases.
    const toGrant: Planned[] = [];
    const toRemove: Planned[] = [];
    const unmanaged: string[] = [];

    for (const member of members.values()) {
      if (member.user.bot) continue;

      const feedTier = supporterTierById.get(member.id);

      if (feedTier) {
        // grant / upgrade
        toGrant.push({
          label: `<@${member.id}> → ${feedTier}`,
          member,
          tier: feedTier,
        });
        continue;
      }

      if (memberHasSupporterRole(member)) {
        if (linkedDiscordIds.has(member.id)) {
          // remove (lapsed, matched to a known account that is no longer active)
          toRemove.push({ label: `<@${member.id}>`, member, tier: null });
        } else {
          // leave (unmanaged): has a supporter role but no linked account.
          // Never strip it — could be a manual Discord grant.
          unmanaged.push(`<@${member.id}>`);
        }
      }
    }

    // 4. DRY RUN — report only, write nothing.
    if (!apply) {
      const embed = new EmbedBuilder()
        .setTitle("Supporter Sync: Dry Run")
        .setColor(DRY_COLOR)
        .setDescription(
          "No changes were made. Re-run with `apply: true` to perform the sync.",
        )
        .addFields(
          {
            name: `Grant / upgrade (${toGrant.length})`,
            value: buildList(toGrant.map((p) => p.label)),
          },
          {
            name: `Remove lapsed (${toRemove.length})`,
            value: buildList(toRemove.map((p) => p.label)),
          },
          {
            name: `Unmanaged, left untouched (${unmanaged.length})`,
            value: buildList(unmanaged),
          },
        )
        .setFooter({ text: "ahousedividedgame.com" });
      await interaction.editReply({ content: "", embeds: [embed] });
      return;
    }

    // 5. APPLY — perform the syncs in bounded batches.
    const plans = [...toGrant, ...toRemove];
    let granted = 0;
    let removed = 0;
    let failed = 0;

    for (let i = 0; i < plans.length; i += CONCURRENCY) {
      const batch = plans.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (plan) => {
          const roleTier = plan.tier ? feedTierToRoleTier(plan.tier) : null;
          await syncSupporterRole(plan.member, roleTier);
          return plan.tier ? "granted" : "removed";
        }),
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value === "granted") granted++;
          else removed++;
        } else {
          failed++;
        }
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("Supporter Sync: Applied")
      .setColor(failed > 0 ? ERROR_COLOR : APPLY_COLOR)
      .addFields(
        { name: "Granted / upgraded", value: String(granted), inline: true },
        { name: "Removed (lapsed)", value: String(removed), inline: true },
        { name: "Errors", value: String(failed), inline: true },
        {
          name: `Unmanaged, left untouched (${unmanaged.length})`,
          value: buildList(unmanaged),
        },
      )
      .setFooter({ text: "ahousedividedgame.com" });
    await interaction.editReply({ content: "", embeds: [embed] });
  } catch (error) {
    console.error("sync-supporters error:", error);
    const embed = new EmbedBuilder()
      .setTitle("Supporter Sync: Failed")
      .setColor(ERROR_COLOR)
      .setDescription("Sync failed. Check bot logs and permissions.");
    await interaction.editReply({ content: "", embeds: [embed] });
  }
}
