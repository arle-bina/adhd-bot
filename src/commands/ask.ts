import {
  SlashCommandBuilder,
  AttachmentBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { apiPostPublicStream } from "../utils/api-base.js";
import { resolveAskIdentity } from "../utils/ask-context.js";
import { splitDiscordContent } from "../utils/discord-content.js";
import { extractAskVisualizations, renderMermaidPng } from "../utils/ask-visualizations.js";

interface AskSource {
  kind: "knowledge" | "state";
  label: string;
}

interface AskResponse {
  answer: string;
  files: string[];
  sources?: AskSource[];
  liveDataUsed?: boolean;
  model: string;
  usage: { input: number; output: number };
}

/** Strip meta-commentary preamble lines ("I'll examine...", "Let me check...", etc.). */
function stripPreamble(text: string): string {
  const preamblePatterns = [
    /^\s*(I'll examine|Let me (check|read|look)|I need to (look|check|examine)|I will (search|look|examine)|Let me search)[^.]*\.\s*/i,
    /^\s*(I'll|I will|Let me|I need to)\s+[^.]*(?:the relevant|the key|the files|the code|the routes|the components)[^.]*\.\s*/i,
  ];
  let cleaned = text;
  for (const pattern of preamblePatterns) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned.trim();
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
  let cleaned = answer;
  cleaned = stripPreamble(cleaned);
  cleaned = stripToolCalls(cleaned);
  cleaned = truncateLongCodeBlocks(cleaned, 30);
  return cleaned;
}

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
  )
  .addStringOption((opt) =>
    opt
      .setName("thinking")
      .setDescription("How deeply should it reason? Defaults to normal")
      .addChoices(
        { name: "Quick", value: "quick" },
        { name: "Normal", value: "normal" },
        { name: "Deep", value: "deep" },
      )
  );

// A live-data answer may need one model call to choose a read-only tool and a
// second to answer from its result. Discord keeps deferred interactions alive
// for 15 minutes, so leave enough room for deep mode without cutting it off.
const ASK_TIMEOUT_MS = 8 * 60_000;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString("question", true).trim();
  const selectedUser = interaction.options.getUser("user");
  const responseLength = interaction.options.getString("response_length") ?? "concise";
  const thinking = interaction.options.getString("thinking") ?? "normal";

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

  // Defer immediately to get the full interaction window, then replace the
  // native spinner with a message that survives on every Discord client.
  await interaction.deferReply();
  await interaction.editReply("Thinking…");

  try {
    const requesterPromise = resolveAskIdentity(interaction.user);
    const subjectPromise = selectedUser
      ? selectedUser.id === interaction.user.id
        ? requesterPromise
        : resolveAskIdentity(selectedUser)
      : Promise.resolve(undefined);
    const [requester, subject] = await Promise.all([requesterPromise, subjectPromise]);

    let liveStatusShown = false;
    const result = await apiPostPublicStream<AskResponse>(
      "/api/ask-public",
      { question, responseLength, thinking, requester, subject },
      async ({ event, data }) => {
        if (event !== "status" || liveStatusShown || typeof data !== "object" || !data) return;
        if ((data as { stage?: string }).stage !== "live_data") return;
        liveStatusShown = true;
        await interaction.editReply("Checking live game data…");
      },
      process.env.OPS_DASHBOARD_URL,
      ASK_TIMEOUT_MS,
    );

    const formatted = formatForDiscord(result.answer);
    const extracted = extractAskVisualizations(formatted);
    const attachments: AttachmentBuilder[] = [];
    for (const visualization of extracted.visualizations) {
      try {
        const image = await renderMermaidPng(visualization.source);
        attachments.push(new AttachmentBuilder(image, {
          name: `ask-visualization-${visualization.index}.png`,
          description: "Visualization generated for this Ask response",
        }));
      } catch {
        extracted.text += "\n\n*(The requested visualization could not be rendered.)*";
      }
    }

    // Build source lists from code retrieval and any read-only live lookups.
    const MAX_SOURCES = 8;
    const REPO_BLOB = "https://github.com/Egg3901/AHDGame/blob/main";
    const fileSources = (result.files || [])
      .slice(0, MAX_SOURCES)
      .map((f) => {
        const rel = f.replace(/^\/+/, "");
        return /^(src|scripts|docs)\//.test(rel)
          ? `• [\`${rel}\`](${REPO_BLOB}/${rel})`
          : `• \`${rel}\``;
      })
      .join("\n");
    const liveSources = (result.sources || [])
      .slice(0, 6)
      .map((source) => `• ${source.label}`)
      .join("\n");

    // Build the complete answer. splitDiscordContent balances code fences and
    // sends every chunk, so detailed answers are never silently truncated.
    let fullMessage = extracted.text;
    if (fileSources) fullMessage += `\n\n**Code sources**\n${fileSources}`;
    if (liveSources) fullMessage += `\n\n**Live sources**\n${liveSources}`;

    const chunks = splitDiscordContent(fullMessage);
    await interaction.editReply({
      content: chunks[0] || "I couldn't produce an answer for that one.",
      files: attachments,
    });
    for (const chunk of chunks.slice(1)) {
      await interaction.followUp({ content: chunk });
    }
  } catch (error) {
    // Use the bot's standard error handling pattern
    const { replyWithError } = await import("../utils/helpers.js");
    await replyWithError(interaction, "ask", error);
  }
}
