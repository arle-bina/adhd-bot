import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { callKeirDesk, KEIR_DESK_SUBCOMMANDS, type KeirDeskSub } from "../utils/keirDesk.js";

// Staff desk for Keir: why is he stuck, who is he waiting on, and (for junior
// devs and devs) nudge, pause and model controls. The desk on the ops box
// checks the caller's roles and refuses what they may not run, so there is no
// role table here to drift out of step with it.
const builder = new SlashCommandBuilder()
  .setName("keir")
  .setDescription("Keir staff desk: see why Keir is stuck or who he is waiting on (staff only)")
  .setDMPermission(false);

for (const spec of KEIR_DESK_SUBCOMMANDS) {
  builder.addSubcommand((sub) => {
    sub.setName(spec.name).setDescription(spec.description);
    if (spec.ticket !== "none") {
      sub.addIntegerOption((opt) =>
        opt
          .setName("ticket")
          .setDescription("Ticket number")
          .setRequired(spec.ticket === "required")
          .setMinValue(1),
      );
    }
    if (spec.name === "model") {
      sub.addStringOption((opt) =>
        opt.setName("name").setDescription("Model to switch to. Leave empty to list the proven ones.").setMaxLength(100),
      );
    }
    sub.addBooleanOption((opt) => opt.setName("share").setDescription("Show the reply to everyone in the channel"));
    return sub;
  });
}

export const data = builder;

function memberRoleIds(interaction: ChatInputCommandInteraction): string[] {
  const roles = interaction.member?.roles;
  if (!roles) return [];
  return Array.isArray(roles) ? roles : [...roles.cache.keys()];
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: "This command only works in the server.", ephemeral: true });
    return;
  }

  // Private first, always: a refusal or an error must never land in the channel.
  await interaction.deferReply({ ephemeral: true });

  const share = interaction.options.getBoolean("share") ?? false;
  const reply = await callKeirDesk({
    sub: interaction.options.getSubcommand() as KeirDeskSub,
    options: {
      ticket: interaction.options.getInteger("ticket") ?? undefined,
      name: interaction.options.getString("name") ?? undefined,
      share,
    },
    member: { id: interaction.user.id, roles: memberRoleIds(interaction) },
  });

  if (share && !reply.ephemeral) {
    await interaction.editReply({ content: "Shared in the channel." });
    await interaction.followUp({ content: reply.content, allowedMentions: { parse: [] } });
    return;
  }
  await interaction.editReply({ content: reply.content, allowedMentions: { parse: [] } });
}
