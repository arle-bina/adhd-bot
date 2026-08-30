import {
  ActionRowBuilder,
  SlashCommandBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
} from "discord.js";
import { apiPostAskSite, apiPostAskSiteStream } from "../utils/api-base.js";
import { resolveAskIdentity } from "../utils/ask-context.js";
import { AskProgressReporter, DiscordConversationTracker } from "../utils/ask-progress.js";
import { splitDiscordContent } from "../utils/discord-content.js";
import { extractAskVisualizations, renderAskMapPng, renderMermaidPng, truncateDiscordCodeBlocks } from "../utils/ask-visualizations.js";
import { asksForSources, compactSources } from "../utils/ask-presentation.js";

interface AskSource {
  kind: "knowledge" | "state";
  label: string;
}

interface AskResponse {
  answer: string;
  answerId?: number;
  files?: string[];
  sources?: AskSource[];
  citations?: Array<string | { path?: string; label?: string }>;
  liveSources?: Array<string | { label?: string }>;
  liveDataUsed?: boolean;
  usedMcp?: boolean;
  model: string;
  modelName?: string;
  providerName?: string;
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
  return truncateDiscordCodeBlocks(text, maxLines);
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
  );

// A live-data answer may need one model call to choose a read-only tool and a
// second to answer from its result. Discord keeps deferred interactions alive
// for 15 minutes, so leave enough room for deep mode without cutting it off.
const ASK_TIMEOUT_MS = 8 * 60_000;

const conversations = new DiscordConversationTracker();

function askFooter(result: AskResponse): EmbedBuilder {
  const usedLive = result.usedMcp ?? result.liveDataUsed ?? false;
  const grounding = usedLive ? "Live game data used" : "Grounded in game rules and documentation";
  const model = result.modelName || result.model;
  const label = [grounding, model && result.providerName ? `${model} via ${result.providerName}` : model].filter(Boolean).join(" · ");
  return new EmbedBuilder().setColor(usedLive ? 0x22c55e : 0x64748b).setFooter({ text: label });
}

function askActions(id: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ask-good:${id}`).setLabel("Helpful").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ask-report:${id}`).setLabel("Report issue").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ask-sources:${id}`).setLabel("Sources").setStyle(ButtonStyle.Secondary),
  );
}

async function submitFeedback(input: Record<string, unknown>): Promise<void> {
  try { await apiPostAskSite("/api/discord-feedback", input); } catch { /* feedback must not disrupt a player interaction */ }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString("question", true).trim();
  const selectedUser = interaction.options.getUser("user");
  const responseLength = interaction.options.getString("response_length") ?? "concise";

  // Defer immediately to get the full interaction window, then replace the
  // native spinner with a message that survives on every Discord client.
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

    const result = await apiPostAskSiteStream<AskResponse>(
      "/api/discord-ask/answer",
      {
        question, responseLength, requester, subject,
        discordId: interaction.user.id,
        discordUsername: interaction.user.username,
        convId: conversations.idFor(interaction.channelId, interaction.user.id),
      },
      ({ event, data }) => {
        if (typeof data !== "object" || !data) return;
        const label = String((data as { label?: unknown }).label || "");
        if (event === "status" && label) progress.status(label);
        if (event === "action" && label) progress.action(label);
      },
      ASK_TIMEOUT_MS,
    );
    await progress.stop();

    const formatted = formatForDiscord(result.answer);
    const extracted = extractAskVisualizations(formatted);
    const attachments: AttachmentBuilder[] = [];
    for (const visualization of extracted.visualizations) {
      try {
        const image = visualization.kind === "map"
          ? await renderAskMapPng(visualization.source)
          : await renderMermaidPng(visualization.source);
        attachments.push(new AttachmentBuilder(image, {
          name: `ask-${visualization.kind}-${visualization.index}.png`,
          description: visualization.kind === "map"
            ? "Live A House Divided game map generated for this Ask response"
            : "Visualization generated for this Ask response",
        }));
      } catch {
        extracted.text += "\n\n*(The requested visualization could not be rendered.)*";
      }
    }

    // Keep the channel answer-first. Source detail is still available through
    // the button, or inline when the player explicitly asks for it.
    let fullMessage = extracted.text;
    if (asksForSources(question)) {
      const sources = compactSources(result);
      if (sources) fullMessage += `\n\n**Sources**\n${sources}`;
    }

    const chunks = splitDiscordContent(fullMessage);
    const reply = await interaction.editReply({
      content: chunks[0] || "I couldn't produce an answer for that one.",
      files: attachments,
      embeds: [askFooter(result)],
      components: [askActions(interaction.id)],
    });
    for (const chunk of chunks.slice(1)) {
      await interaction.followUp({ content: chunk });
    }
    const collector = reply.createMessageComponentCollector({ time: 15 * 60_000, max: 3 });
    collector.on("collect", async button => {
      if (button.user.id !== interaction.user.id) {
        await button.reply({ content: "Only the person who asked can use these controls.", ephemeral: true });
        return;
      }
      const kind = button.customId.split(":")[0];
      if (kind === "ask-sources") {
        await button.reply({ content: `**Sources**\n${compactSources(result) || "No compact source list was returned."}`, ephemeral: true });
        return;
      }
      if (kind === "ask-good") {
        await submitFeedback({ discordId: interaction.user.id, username: interaction.user.username, question,
          answer: result.answer, answerId: result.answerId, rating: "up", usedMcp: Boolean(result.usedMcp ?? result.liveDataUsed) });
        await button.reply({ content: "Thanks, recorded as helpful.", ephemeral: true });
        return;
      }
      if (kind !== "ask-report") return;
      const modal = new ModalBuilder().setCustomId(`ask-report-modal:${interaction.id}`).setTitle("Report an Ask answer");
      const reason = new TextInputBuilder().setCustomId("reason").setLabel("What was wrong?")
        .setStyle(TextInputStyle.Paragraph).setPlaceholder("Wrong data, irrelevant, missing context, etc.")
        .setRequired(false).setMaxLength(500);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason));
      await button.showModal(modal);
      try {
        const submission = await button.awaitModalSubmit({ time: 5 * 60_000,
          filter: value => value.customId === `ask-report-modal:${interaction.id}` && value.user.id === interaction.user.id });
        await submitFeedback({ discordId: interaction.user.id, username: interaction.user.username, question,
          answer: result.answer, answerId: result.answerId, rating: "down", reason: submission.fields.getTextInputValue("reason"), usedMcp: Boolean(result.usedMcp ?? result.liveDataUsed) });
        await submission.reply({ content: "Thanks, the issue is in the Ask review queue.", ephemeral: true });
      } catch { /* modal expiry needs no player-facing error */ }
    });
  } catch (error) {
    await progress.stop();
    // Use the bot's standard error handling pattern
    const { replyWithError } = await import("../utils/helpers.js");
    await replyWithError(interaction, "ask", error);
  }
}
