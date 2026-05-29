import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  GuildMember,
} from "discord.js";
import { postSupporter, deleteSupporter, lookupByName, lookupByDiscordId } from "../utils/api.js";
import { replyWithError } from "../utils/helpers.js";

const OK_COLOR = 0x57f287;
const ERROR_COLOR = 0xed4245;
const NEUTRAL_COLOR = 0x5865f2;

export const data = new SlashCommandBuilder()
  .setName("supporter")
  .setDescription("Manage supporter status for a player (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Grant supporter status to a player")
      .addStringOption((opt) =>
        opt
          .setName("tier")
          .setDescription("Supporter tier")
          .setRequired(true)
          .addChoices(
            { name: "Regular", value: "regular" },
            { name: "Plus", value: "plus" },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("In-game character name")
          .setRequired(false)
          .setAutocomplete(true),
      )
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("Discord user to look up")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove supporter status from a player")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("In-game character name")
          .setRequired(false)
          .setAutocomplete(true),
      )
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("Discord user to look up")
          .setRequired(false),
      ),
  );

async function resolveTarget(
  interaction: ChatInputCommandInteraction,
): Promise<{ discordId?: string; name?: string; resolvedName?: string } | null> {
  const name = interaction.options.getString("name");
  const user = interaction.options.getUser("user");

  if (!name && !user) {
    await interaction.reply({
      content: "Please provide either a character name or a Discord user.",
      ephemeral: true,
    });
    return null;
  }

  if (user) {
    // Try lookup by Discord ID first to validate the user has a linked account
    const result = await lookupByDiscordId(user.id);
    if (result.found && result.characters.length > 0) {
      return { discordId: user.id, resolvedName: result.characters[0].name };
    }
    // User exists in Discord but no linked game account — still allow by discordId
    // since they may link later or the API handles it
    return { discordId: user.id };
  }

  if (name) {
    const result = await lookupByName(name);
    if (!result.found || result.characters.length === 0) {
      await interaction.reply({
        content: `No character found matching "${name}".`,
        ephemeral: true,
      });
      return null;
    }
    const char = result.characters[0];
    return {
      name: char.name,
      discordId: char.discordUsername ? undefined : undefined, // Only set if we have a reliable discordId
      resolvedName: char.name,
    };
  }

  return null;
}

async function getSupporterRoleIds(guildId: string): Promise<{ regular?: string; plus?: string }> {
  return {
    regular: process.env.SUPPORTER_ROLE_ID || undefined,
    plus: process.env.SUPPORTER_PLUS_ROLE_ID || undefined,
  };
}

async function syncSupporterRole(
  member: GuildMember,
  tier: "regular" | "plus" | null,
): Promise<{ added: string[]; removed: string[] }> {
  const roles = await getSupporterRoleIds(member.guild.id);
  const added: string[] = [];
  const removed: string[] = [];

  const regularRole = roles.regular ? member.guild.roles.cache.get(roles.regular) : null;
  const plusRole = roles.plus ? member.guild.roles.cache.get(roles.plus) : null;

  // Remove roles that shouldn't be present
  if (regularRole && member.roles.cache.has(regularRole.id) && tier !== "regular" && tier !== "plus") {
    await member.roles.remove(regularRole.id, "supporter remove").catch(() => {});
    removed.push(regularRole.name);
  }
  if (plusRole && member.roles.cache.has(plusRole.id) && tier !== "plus") {
    await member.roles.remove(plusRole.id, "supporter remove").catch(() => {});
    removed.push(plusRole.name);
  }

  // Add the appropriate role
  if (tier === "plus" && plusRole) {
    if (!member.roles.cache.has(plusRole.id)) {
      await member.roles.add(plusRole.id, "supporter add plus").catch(() => {});
      added.push(plusRole.name);
    }
    // Ensure regular is removed when plus is added
    if (regularRole && member.roles.cache.has(regularRole.id)) {
      await member.roles.remove(regularRole.id, "supporter upgrade to plus").catch(() => {});
      removed.push(regularRole.name);
    }
  } else if (tier === "regular" && regularRole) {
    if (!member.roles.cache.has(regularRole.id)) {
      await member.roles.add(regularRole.id, "supporter add regular").catch(() => {});
      added.push(regularRole.name);
    }
    // Ensure plus is removed when regular is set
    if (plusRole && member.roles.cache.has(plusRole.id)) {
      await member.roles.remove(plusRole.id, "supporter downgrade to regular").catch(() => {});
      removed.push(plusRole.name);
    }
  }

  return { added, removed };
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: "This command can only be used inside a server.",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  await interaction.deferReply({ ephemeral: true });

  try {
    const target = await resolveTarget(interaction);
    if (!target) return;

    if (subcommand === "add") {
      const tier = interaction.options.getString("tier", true) as "regular" | "plus";

      const body: { discordId?: string; name?: string; tier: "regular" | "plus" } = {
        tier,
        ...(target.discordId ? { discordId: target.discordId } : {}),
        ...(target.name ? { name: target.name } : {}),
      };

      const result = await postSupporter(body);

      if (!result.found) {
        const embed = new EmbedBuilder()
          .setTitle("Supporter — Not Found")
          .setColor(ERROR_COLOR)
          .setDescription(
            result.message ||
              `Could not find a linked account for **${target.resolvedName || target.name || "this user"}**.`,
          );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Sync Discord role if we have a discordId
      let roleSync: { added: string[]; removed: string[] } | null = null;
      if (result.discordId) {
        try {
          const member = await interaction.guild.members.fetch(result.discordId);
          roleSync = await syncSupporterRole(member, tier);
        } catch {
          // Member not in guild — skip role sync
        }
      }

      const embed = new EmbedBuilder()
        .setTitle("Supporter Added")
        .setColor(OK_COLOR)
        .addFields(
          {
            name: "Character",
            value: result.characterName || target.resolvedName || target.name || "Unknown",
            inline: true,
          },
          { name: "Tier", value: tier === "plus" ? "Plus" : "Regular", inline: true },
        );

      if (result.discordUsername) {
        embed.addFields({
          name: "Discord",
          value: `<@${result.discordId}> (${result.discordUsername})`,
          inline: true,
        });
      }

      if (roleSync) {
        const roleLines: string[] = [];
        if (roleSync.added.length > 0) roleLines.push(`Added: ${roleSync.added.join(", ")}`);
        if (roleSync.removed.length > 0) roleLines.push(`Removed: ${roleSync.removed.join(", ")}`);
        if (roleLines.length > 0) {
          embed.addFields({ name: "Discord Roles", value: roleLines.join("\n") });
        }
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (subcommand === "remove") {
      const body: { discordId?: string; name?: string } = {
        ...(target.discordId ? { discordId: target.discordId } : {}),
        ...(target.name ? { name: target.name } : {}),
      };

      const result = await deleteSupporter(body);

      if (!result.found) {
        const embed = new EmbedBuilder()
          .setTitle("Supporter — Not Found")
          .setColor(ERROR_COLOR)
          .setDescription(
            result.message ||
              `Could not find a linked account for **${target.resolvedName || target.name || "this user"}**.`,
          );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Remove Discord roles if we have a discordId
      let roleSync: { added: string[]; removed: string[] } | null = null;
      if (result.discordId) {
        try {
          const member = await interaction.guild.members.fetch(result.discordId);
          roleSync = await syncSupporterRole(member, null);
        } catch {
          // Member not in guild — skip role sync
        }
      }

      const embed = new EmbedBuilder()
        .setTitle("Supporter Removed")
        .setColor(NEUTRAL_COLOR)
        .addFields(
          {
            name: "Character",
            value: result.characterName || target.resolvedName || target.name || "Unknown",
            inline: true,
          },
          { name: "Tier", value: "None", inline: true },
        );

      if (result.discordUsername) {
        embed.addFields({
          name: "Discord",
          value: `<@${result.discordId}> (${result.discordUsername})`,
          inline: true,
        });
      }

      if (roleSync) {
        const roleLines: string[] = [];
        if (roleSync.added.length > 0) roleLines.push(`Added: ${roleSync.added.join(", ")}`);
        if (roleSync.removed.length > 0) roleLines.push(`Removed: ${roleSync.removed.join(", ")}`);
        if (roleLines.length > 0) {
          embed.addFields({ name: "Discord Roles", value: roleLines.join("\n") });
        }
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }
  } catch (error) {
    await replyWithError(interaction, "supporter", error);
  }
}
