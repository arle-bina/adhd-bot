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

/** Strip tool call artifacts (XML tags, function invocations). */
function stripToolCalls(text: string): string {
  return text
    .replace(/<function_calls>[\s\S]*?<\/function_calls>/g, "")
    .replace(/<invoke[\s\S]*?<\/invoke>/g, "")
    .replace(/<parameter[\s\S]*?<\/parameter>/g, "")
    .replace(/\b(read_file|read_files)\s*\([^)]*\)/g, "")
    .trim();
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

/** Format the LLM answer for Discord. */
function formatForDiscord(answer: string): string {
  let cleaned = stripMermaid(answer);
  cleaned = stripToolCalls(cleaned);
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

  // Show "Thinking..." immediately, then edit when answer arrives
  const thinkingMsg = await interaction.reply({
    content: "🤔 Thinking...",
    fetchReply: true,
  });

  try {
    const result = await apiPostPublic<AskResponse>(
      "/api/ask-public",
      { question },
      process.env.OPS_DASHBOARD_URL
    );

    const answer = formatForDiscord(result.answer);

    // Build the full message — no sources, no question repeat, no model metadata
    let fullMessage = answer;

    // Discord message limit is 2000 chars
    if (fullMessage.length > MAX_MESSAGE_LENGTH) {
      fullMessage = answer.slice(0, MAX_MESSAGE_LENGTH - 30) + "\n\n*(truncated)*";
    }

    await thinkingMsg.edit(fullMessage);
  } catch (error) {
    // Use the bot's standard error handling pattern
    const { replyWithError } = await import("../utils/helpers.js");
    await replyWithError(interaction, "ask", error);
  }
}
