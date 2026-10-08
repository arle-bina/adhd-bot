import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import {
  buildSummonEmbed,
  buildSummonFailureEmbed,
  fetchSummonStatus,
  markSummonChannel,
  pokeSummon,
  type SummonAction,
} from "../utils/summon.js";

export const data = new SlashCommandBuilder()
  .setName("summon")
  .setDescription("Summon the Prime Minister to this channel (developers only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("Summon Keir with a question or a heal request, or hand him another one")
      .addStringOption((opt) =>
        opt.setName("message").setDescription("What you want to know or fixed").setRequired(true).setMaxLength(4000),
      ),
  )
  .addSubcommand((sub) => sub.setName("stop").setDescription("Dismiss Keir from this channel"))
  .addSubcommand((sub) => sub.setName("status").setDescription("Is Keir here, and is he working?"));

function isDeveloper(interaction: ChatInputCommandInteraction): boolean {
  const devRoleId = process.env.DEVELOPER_ROLE_ID;
  const roles = interaction.member?.roles;
  if (!devRoleId || !roles) return false;
  return Array.isArray(roles) ? roles.includes(devRoleId) : roles.cache.has(devRoleId);
}

async function replyStatus(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const status = await fetchSummonStatus(interaction.channelId);
  if (!status) {
    await interaction.editReply({ content: "Couldn't reach the ops box to check." });
    return;
  }
  markSummonChannel(interaction.channelId, status.active);
  if (!status.active) {
    await interaction.editReply({ content: "Keir is not in this channel. `/summon start` to bring him in." });
    return;
  }
  const since = status.startedAt ? `<t:${Math.floor(Date.parse(status.startedAt) / 1000)}:R>` : "a while ago";
  const lines = [
    `Keir is here and ${status.working ? "**working**" : "**idle**"}. Summoned ${since}${status.summonedBy ? ` by <@${status.summonedBy}>` : ""}.`,
    `Queued messages: ${status.queued ?? 0}. Scheduled check-ins: ${status.checkIns ?? 0}.${status.healPending ? " A heal is waiting for a ✅." : ""}`,
    status.model ? `Model: \`${status.model}\`` : "",
  ];
  await interaction.editReply({ content: lines.filter(Boolean).join("\n"), allowedMentions: { parse: [] } });
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild() || !isDeveloper(interaction)) {
    await interaction.reply({ content: "Only the developers can summon the Prime Minister.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();
  if (sub === "status") {
    await replyStatus(interaction);
    return;
  }

  const action: SummonAction = sub === "stop" ? "stop" : "start";
  const task = action === "start" ? interaction.options.getString("message", true) : undefined;

  // Public on purpose: the ops box reads this reply back from Discord to
  // verify the command, and ephemeral messages cannot be fetched.
  await interaction.deferReply();
  const reply = await interaction.editReply({
    embeds: [buildSummonEmbed(action, { userId: interaction.user.id, task })],
    allowedMentions: { parse: [] },
  });

  const result = await pokeSummon(interaction.channelId, reply.id);
  if (!result.ok) {
    const reason =
      result.status === 429
          ? `He is already busy in other channels (${result.error ?? "limit reached"}). Dismiss him from one first.`
          : `The ops box refused it: ${result.error ?? `HTTP ${result.status}`}.`;
    await interaction.editReply({ embeds: [buildSummonFailureEmbed(reason)] });
    return;
  }

  markSummonChannel(interaction.channelId, action !== "stop");
  if (action === "start" && result.forwarded) {
    const embed = buildSummonEmbed(action, { userId: interaction.user.id, task });
    embed.setTitle("The Prime Minister takes another question.");
    await interaction.editReply({ embeds: [embed] }).catch(() => {});
  }
}
