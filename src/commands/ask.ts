import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { resolveAskIdentity } from "../utils/ask-context.js";
import { AskProgressReporter } from "../utils/ask-progress.js";
import { registerAskAnswer } from "../utils/ask-continuation.js";
import { deliverAskAnswer, requestAsk } from "../utils/ask-runtime.js";

export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Ask about AHD mechanics or live game data")
  .addStringOption((opt) =>
    opt
      .setName("question")
      .setDescription("What do you want to know?")
      .setRequired(true)
      .setMaxLength(2000)
  )
  .addUserOption((opt) =>
    opt
      .setName("user")
      .setDescription("Discord user whose linked game profile the question is about")
      .setRequired(false)
  )
  .addStringOption((opt) =>
    opt
      .setName("response_length")
      .setDescription("How much detail? Defaults to concise")
      .addChoices(
        { name: "Concise", value: "concise" },
        { name: "Standard", value: "standard" },
        { name: "Detailed", value: "detailed" },
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString("question", true).trim();
  const selectedUser = interaction.options.getUser("user");
  const responseLength = interaction.options.getString("response_length") ?? "concise";

  // Defer immediately to get the full interaction window, then replace the
  // native spinner with a message that survives on every Discord client. Once
  // the engine starts streaming, the same message becomes a live preview of
  // the answer being written.
  await interaction.deferReply();
  await interaction.editReply("Thinking…");
  const progress = new AskProgressReporter(content => interaction.editReply(content));

  try {
    const requesterPromise = resolveAskIdentity(interaction.user);
    const subjectPromise = selectedUser
      ? selectedUser.id === interaction.user.id
        ? requesterPromise
        : resolveAskIdentity(selectedUser)
      : Promise.resolve(undefined);
    const [requester, subject] = await Promise.all([requesterPromise, subjectPromise]);

    const result = await requestAsk({
      question,
      responseLength,
      requester,
      subject,
      discordId: interaction.user.id,
      discordUsername: interaction.user.username,
      channelId: interaction.channelId,
      progress,
    });
    await progress.stop();

    const delivered = await deliverAskAnswer({
      scopeId: interaction.id,
      userId: interaction.user.id,
      username: interaction.user.username,
      question,
      edit: payload => interaction.editReply(payload),
      followUp: content => interaction.followUp({ content }),
    }, result);
    // Replying to the delivered answer continues this conversation.
    registerAskAnswer(delivered.id, { userId: interaction.user.id, question });
  } catch (error) {
    await progress.stop();
    // Use the bot's standard error handling pattern
    const { replyWithError } = await import("../utils/helpers.js");
    await replyWithError(interaction, "ask", error);
  }
}
