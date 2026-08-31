import {
  ActionRowBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonBuilder,
  type Message,
} from "discord.js";
import { apiPostAskSite, apiPostAskSiteStream } from "./api-base.js";
import { AskProgressReporter, DiscordConversationTracker } from "./ask-progress.js";
import { splitDiscordContent } from "./discord-content.js";
import { extractAskVisualizations, renderAskMapPng, renderMermaidPng, truncateDiscordCodeBlocks } from "./ask-visualizations.js";
import { askActions, asksForSources, compactSources, FEEDBACK_FAILED } from "./ask-presentation.js";
import type { AskIdentity } from "./ask-context.js";

export interface AskSource {
  kind: "knowledge" | "state";
  label: string;
}

export interface AskResponse {
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

// A live-data answer may need several model and tool calls. Discord keeps
// deferred interactions alive for 15 minutes; leave room for deep mode.
export const ASK_TIMEOUT_MS = 8 * 60_000;

// One tracker for every entry point, so a reply-based follow-up continues the
// same conversation the slash command started.
export const conversations = new DiscordConversationTracker();

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

/** Format the LLM answer for Discord. */
export function formatForDiscord(answer: string): string {
  return truncateDiscordCodeBlocks(stripToolCalls(stripPreamble(answer)), 30);
}

function askFooter(result: AskResponse): EmbedBuilder {
  const usedLive = result.usedMcp ?? result.liveDataUsed ?? false;
  const grounding = usedLive ? "Live game data used" : "Grounded in game rules and documentation";
  const model = result.modelName || result.model;
  const label = [grounding, model && result.providerName ? `${model} via ${result.providerName}` : model].filter(Boolean).join(" · ");
  return new EmbedBuilder().setColor(usedLive ? 0x22c55e : 0x64748b).setFooter({ text: label });
}

interface FeedbackResult {
  ok: boolean;
  queued?: boolean;
}

// Returns whether ask-site actually accepted the feedback: a confirmation
// must not lie about a submission a 401 or an outage just discarded.
async function submitFeedback(input: Record<string, unknown>): Promise<FeedbackResult | null> {
  try {
    return await apiPostAskSite<FeedbackResult>("/api/discord-feedback", input);
  } catch (error) {
    console.error("[ask] feedback submit failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

export interface AskRequestOptions {
  question: string;
  responseLength: string;
  requester?: AskIdentity;
  subject?: AskIdentity;
  discordId: string;
  discordUsername: string;
  channelId: string;
  progress: AskProgressReporter;
}

/** One Ask engine round trip with live progress and streamed answer preview. */
export async function requestAsk(options: AskRequestOptions): Promise<AskResponse> {
  return apiPostAskSiteStream<AskResponse>(
    "/api/discord-ask/answer",
    {
      question: options.question,
      responseLength: options.responseLength,
      requester: options.requester,
      subject: options.subject,
      discordId: options.discordId,
      discordUsername: options.discordUsername,
      convId: conversations.idFor(options.channelId, options.discordId),
    },
    ({ event, data }) => {
      if (event === "delta" && typeof data === "string") {
        options.progress.delta(data);
        return;
      }
      if (typeof data !== "object" || !data) return;
      const label = String((data as { label?: unknown }).label || "");
      if (event === "status" && label) options.progress.status(label);
      if (event === "action" && label) options.progress.action(label);
    },
    ASK_TIMEOUT_MS,
  );
}

export interface AskDeliveryTarget {
  /** Unique id scoping this answer's button custom ids (e.g. interaction or message id). */
  scopeId: string;
  /** The player who asked; only they may use the controls. */
  userId: string;
  username: string;
  question: string;
  /** Replace the main answer message; returns it so a collector can attach. */
  edit(payload: {
    content: string;
    files: AttachmentBuilder[];
    embeds: EmbedBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
  }): Promise<Message>;
  /** Additional messages for answers over one Discord message. */
  followUp(content: string): Promise<unknown>;
}

/**
 * Render a finished answer into Discord: visualizations as attachments,
 * chunked text, footer, and the feedback controls with their full lifecycle
 * (one rating per answer, truthful confirmations, disabled on expiry).
 * Returns the delivered answer message.
 */
export async function deliverAskAnswer(target: AskDeliveryTarget, result: AskResponse): Promise<Message> {
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
  if (asksForSources(target.question)) {
    const sources = compactSources(result);
    if (sources) fullMessage += `\n\n**Sources**\n${sources}`;
  }

  const chunks = splitDiscordContent(fullMessage);
  const reply = await target.edit({
    content: chunks[0] || "I couldn't produce an answer for that one.",
    files: attachments,
    embeds: [askFooter(result)],
    components: [askActions(target.scopeId)],
  });
  for (const chunk of chunks.slice(1)) {
    await target.followUp(chunk);
  }

  // No `max`: a capped collector was consumed by ANY component click, after
  // which the asker's own Report button silently died. One rating per answer
  // is enforced explicitly, and the row re-renders so state is visible.
  const collector = reply.createMessageComponentCollector({
    time: 14 * 60_000,
    filter: button => button.customId.endsWith(`:${target.scopeId}`),
  });
  let rated: "up" | "down" | null = null;
  const feedbackBody = (rating: "up" | "down", reason?: string): Record<string, unknown> => ({
    discordId: target.userId, username: target.username, question: target.question,
    answer: result.answer, answerId: result.answerId, rating,
    ...(reason ? { reason } : {}),
    usedMcp: Boolean(result.usedMcp ?? result.liveDataUsed),
  });
  const showRated = async (kind: "up" | "down") => {
    rated = kind;
    try { await reply.edit({ components: [askActions(target.scopeId, { ratingDisabled: true, ratedLabel: kind })] }); } catch { /* cosmetic */ }
  };
  collector.on("collect", async button => {
    if (button.user.id !== target.userId) {
      await button.reply({ content: "Only the person who asked can use these controls.", ephemeral: true });
      return;
    }
    const kind = button.customId.split(":")[0];
    if (kind === "ask-sources") {
      await button.reply({ content: `**Sources**\n${compactSources(result) || "No compact source list was returned."}`, ephemeral: true });
      return;
    }
    if (rated) {
      await button.reply({ content: "Feedback for this answer is already recorded.", ephemeral: true });
      return;
    }
    if (kind === "ask-good") {
      const sent = await submitFeedback(feedbackBody("up"));
      if (sent?.ok) {
        await showRated("up");
        await button.reply({ content: "Thanks, recorded as helpful.", ephemeral: true });
      } else {
        await button.reply({ content: FEEDBACK_FAILED, ephemeral: true });
      }
      return;
    }
    if (kind !== "ask-report") return;
    const modal = new ModalBuilder().setCustomId(`ask-report-modal:${target.scopeId}`).setTitle("Report an Ask answer");
    const reason = new TextInputBuilder().setCustomId("reason").setLabel("What was wrong?")
      .setStyle(TextInputStyle.Paragraph).setPlaceholder("Wrong data, irrelevant, missing context, etc.")
      .setRequired(false).setMaxLength(500);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason));
    await button.showModal(modal);
    try {
      const submission = await button.awaitModalSubmit({ time: 5 * 60_000,
        filter: value => value.customId === `ask-report-modal:${target.scopeId}` && value.user.id === target.userId });
      const sent = await submitFeedback(feedbackBody("down", submission.fields.getTextInputValue("reason")));
      if (sent?.ok) {
        await showRated("down");
        // Only claim the review queue when the server says the report was
        // actually queued for staff review.
        await submission.reply({ content: sent.queued ? "Thanks, the issue is in the Ask review queue." : "Thanks, the report is recorded.", ephemeral: true });
      } else {
        await submission.reply({ content: FEEDBACK_FAILED, ephemeral: true });
      }
    } catch { /* modal expiry needs no player-facing error */ }
  });
  collector.on("end", async () => {
    // Dead-looking-alive buttons read as errors ("This interaction failed").
    try { await reply.edit({ components: [askActions(target.scopeId, { allDisabled: true, ratedLabel: rated ?? undefined })] }); } catch { /* message may be gone */ }
  });

  return reply;
}
