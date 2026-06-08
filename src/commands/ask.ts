import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { apiPostPublic } from "../utils/api-base.js";

const MAX_MESSAGE_LENGTH = 2000;

interface AskResponse {
  answer: string;
  files: string[];
  model: string;
  usage: { input: number; output: number };
}

/** Strip mermaid blocks (Discord can't render them). Replace with a note. */
function stripMermaid(text: string): string {
  return text.replace(
    /```mermaid[\s\S]*?```/g,
    "*(Mermaid diagram omitted — view in ops dashboard for full rendering)*"
  );
}

/** Truncate code blocks that are too long for Discord. */
function truncateLongCodeBlocks(text: string, maxLines = 30): string {
  return text.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, lang, code) => {
    const lines = code.split("\n");
    if (lines.length <= maxLines) return _match;
    const kept = lines.slice(0, maxLines).join("\n");
    return `\`\`\`${lang || ""}\n${kept}\n... (${lines.length - maxLines} more lines — see ops dashboard)\n\`\`\``;
  });
}

/** Format the LLM answer for Discord: strip mermaid, truncate long blocks. */
function formatForDiscord(answer: string): string {
  let cleaned = stripMermaid(answer);
  cleaned = truncateLongCodeBlocks(cleaned, 30);
  return cleaned;
}

export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Ask a question about the AHD codebase")
  .addStringOption((opt) =>
    opt
      .setName("question")
      .setDescription("What do you want to know?")
      .setRequired(true)
      .setMaxLength(2000)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString("question", true).trim();

  // Role gate: only developers and server moderators may use /ask
  const allowedIds = [
    process.env.DEVELOPER_ROLE_ID!,
    process.env.SERVER_MODERATOR_ID!,
  ].filter(Boolean);
  const memberRoles = interaction.member?.roles;
  const hasAllowedRole = memberRoles && "cache" in memberRoles
    ? allowedIds.some((id) => memberRoles.cache.has(id))
    : false;

  if (!hasAllowedRole) {
    await interaction.reply({
      content: "You don't have permission to use this command.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const result = await apiPostPublic<AskResponse>(
      "/api/ask-public",
      { question },
      process.env.OPS_DASHBOARD_URL
    );

    const answer = formatForDiscord(result.answer);
    const fileList = result.files.length
      ? result.files.map((f) => `\`${f}\``).join(", ")
      : "*(none identified)*";

    const header = `**Question:** ${question}\n**Sources:** ${fileList}\n\n`;
    const footer = `\n\n_Model: ${result.model} · ${result.usage.input}+${result.usage.output} tokens_`;

    // Build the full message
    let fullMessage = header + answer + footer;

    // Discord message limit is 2000 chars
    if (fullMessage.length > MAX_MESSAGE_LENGTH) {
      const truncated = answer.slice(0, MAX_MESSAGE_LENGTH - header.length - footer.length - 50);
      fullMessage = header + truncated + "\n\n*(Answer truncated — view full response in ops dashboard)*" + footer;
    }

    await interaction.editReply({ content: fullMessage });
  } catch (error) {
    // Use the bot's standard error handling pattern
    const { replyWithError } = await import("../utils/helpers.js");
    await replyWithError(interaction, "ask", error);
  }
}
