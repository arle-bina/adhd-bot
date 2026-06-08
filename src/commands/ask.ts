import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { apiPostPublic } from "../utils/api-base.js";
import { standardFooter } from "../utils/helpers.js";

const ASK_COLOR = 0x5865f2;
const MAX_DISCORD_LENGTH = 4096; // embed description limit
const MAX_FIELD_VALUE = 1024;

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

/** Truncate code blocks that are too long for Discord embeds. */
function truncateLongCodeBlocks(text: string, maxLines = 30): string {
  return text.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, lang, code) => {
    const lines = code.split("\n");
    if (lines.length <= maxLines) return _match;
    const kept = lines.slice(0, maxLines).join("\n");
    return `\`\`\`${lang || ""}\n${kept}\n... (${lines.length - maxLines} more lines — see ops dashboard)\n\`\`\``;
  });
}

/** Format the LLM answer for Discord: strip mermaid, truncate long blocks, split if needed. */
function formatForDiscord(answer: string): { parts: string[]; hasMore: boolean } {
  let cleaned = stripMermaid(answer);
  cleaned = truncateLongCodeBlocks(cleaned, 30);

  // If it fits in one embed description, great
  if (cleaned.length <= MAX_DISCORD_LENGTH) {
    return { parts: [cleaned], hasMore: false };
  }

  // Split into chunks at paragraph or code-block boundaries
  const parts: string[] = [];
  let remaining = cleaned;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_DISCORD_LENGTH) {
      parts.push(remaining);
      break;
    }

    // Try to find a clean split point
    let splitAt = MAX_DISCORD_LENGTH;
    const prevPara = remaining.lastIndexOf("\n\n", splitAt);
    const prevLine = remaining.lastIndexOf("\n", splitAt);
    const prevCode = remaining.lastIndexOf("\n```", splitAt);

    // Prefer splitting after a code block, then paragraph, then line
    if (prevCode > splitAt - 500 && prevCode > 0) {
      splitAt = prevCode + 4; // after ```
    } else if (prevPara > splitAt - 800 && prevPara > 0) {
      splitAt = prevPara + 2;
    } else if (prevLine > splitAt - 300 && prevLine > 0) {
      splitAt = prevLine + 1;
    }

    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();

    // Safety: if we can't make progress, force-split
    if (remaining.length > 0 && remaining.length === cleaned.length) {
      parts.push(remaining.slice(0, MAX_DISCORD_LENGTH));
      remaining = remaining.slice(MAX_DISCORD_LENGTH);
    }
  }

  return { parts, hasMore: parts.length > 1 };
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

  // Role gate: only admins, moderators, and developers may use /ask
  const allowedIds = [
    process.env.DEVELOPER_ROLE_ID!,
    process.env.SERVER_MODERATOR_ID!,
    process.env.DEV_TEAM_ROLE_ID!,
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

    const { parts } = formatForDiscord(result.answer);
    const fileList = result.files.length
      ? result.files.map((f) => `\`${f}\``).join(", ")
      : "*(none identified)*";

    // First embed: question + first part of answer
    const firstEmbed = new EmbedBuilder()
      .setColor(ASK_COLOR)
      .setTitle("Codebase Q\u0026A")
      .setDescription(parts[0] || "No answer returned.")
      .addFields(
        { name: "Question", value: question.slice(0, MAX_FIELD_VALUE), inline: false },
        { name: "Sources", value: fileList.slice(0, MAX_FIELD_VALUE), inline: false }
      )
      .setFooter(standardFooter(`Model: ${result.model} · ${result.usage.input}+${result.usage.output} tokens`))
      .setTimestamp();

    const embeds: EmbedBuilder[] = [firstEmbed];

    // Additional embeds for overflow content
    for (let i = 1; i < parts.length; i++) {
      const overflow = new EmbedBuilder()
        .setColor(ASK_COLOR)
        .setDescription(parts[i]);
      embeds.push(overflow);
    }

    // Discord limit: 10 embeds per message
    if (embeds.length > 10) {
      embeds.length = 9;
      const truncated = new EmbedBuilder()
        .setColor(ASK_COLOR)
        .setDescription("*(Answer truncated — view full response in ops dashboard)*");
      embeds.push(truncated);
    }

    await interaction.editReply({ embeds });
  } catch (error) {
    // Use the bot's standard error handling pattern
    const { replyWithError } = await import("../utils/helpers.js");
    await replyWithError(interaction, "ask", error);
  }
}
