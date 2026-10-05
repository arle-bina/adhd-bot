import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Message,
  type MessageComponentInteraction,
} from "discord.js";
import { apiPostAskSite, apiPostAskSiteStream } from "./api-base.js";
import { AskProgressReporter, DiscordConversationTracker } from "./ask-progress.js";
import { splitDiscordContent } from "./discord-content.js";
import { extractAskVisualizations, renderAskMapPng, renderAskVisualizationPng, truncateDiscordCodeBlocks } from "./ask-visualizations.js";
import { askActions, askFollowupRow, asksForSources, compactSources, FEEDBACK_FAILED } from "./ask-presentation.js";
import { ASK_MENTIONS } from "./ask-safety.js";
import type { AskIdentity } from "./ask-context.js";

export interface AskSource {
  kind: "knowledge" | "state";
  label: string;
}

export interface AskUsage {
  used?: number;
  limit?: number;
  remaining?: number;
  mcpRemaining?: number;
  mcpLimit?: number;
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
  usage?: AskUsage | { input: number; output: number };
  questionTrimmed?: boolean;
  followups?: string[];
  followupsLeft?: number;
  reportUrl?: string | null;
  vizBlocked?: boolean;
}

export const ASK_SITE_ORIGIN = (process.env.ASK_SITE_URL || "https://ask.lakesidegames.net").replace(/\/$/, "");

// A live-data answer may need several model and tool calls. Discord keeps
// deferred interactions alive for 15 minutes; leave room for deep mode and
// for the follow-up messages that are sent after the answer arrives.
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

/** Strip tool call artifacts (XML tags, function invocations) and machine markers. */
function stripToolCalls(text: string): string {
  return text
    .replace(/<function_calls>[\s\S]*?<\/function_calls>/g, "")
    .replace(/<invoke[\s\S]*?<\/invoke>/g, "")
    .replace(/<parameter[\s\S]*?<\/parameter>/g, "")
    .replace(/\b(read_file|read_files)\s*\([^)]*\)/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

/** Format the LLM answer for Discord. */
export function formatForDiscord(answer: string): string {
  return truncateDiscordCodeBlocks(stripToolCalls(stripPreamble(answer)), 30);
}

function isQuotaUsage(usage: AskResponse["usage"]): usage is AskUsage {
  return Boolean(usage && typeof usage === "object" && "remaining" in usage);
}

export interface AskFooterContext {
  requester?: AskIdentity;
}

/** The footer line under every answer: grounding, model, quota, and identity. */
export function askFooterText(result: AskResponse, context: AskFooterContext = {}): string {
  const usedLive = result.usedMcp ?? result.liveDataUsed ?? false;
  const parts: string[] = [usedLive ? "Live game data used" : "Grounded in game rules and documentation"];
  const model = result.modelName || result.model;
  if (model) parts.push(result.providerName ? `${model} via ${result.providerName}` : model);
  if (isQuotaUsage(result.usage) && typeof result.usage.remaining === "number" && typeof result.usage.limit === "number") {
    parts.push(`${result.usage.remaining} of ${result.usage.limit} questions left today`);
  }
  const lines = [parts.join(" · ")];
  const requester = context.requester;
  if (requester?.characterCount && requester.characterCount > 1) {
    lines.push(`Answered as ${requester.characterName} (1 of ${requester.characterCount} characters; pick another with the character option)`);
  }
  if (result.questionTrimmed) lines.push("Your question was trimmed to 500 characters.");
  if (result.vizBlocked) lines.push("Charts and maps are a supporter feature; this answer is text only.");
  return lines.join("\n").slice(0, 2000);
}

function askFooter(result: AskResponse, context: AskFooterContext): EmbedBuilder {
  const usedLive = result.usedMcp ?? result.liveDataUsed ?? false;
  return new EmbedBuilder().setColor(usedLive ? 0x22c55e : 0x64748b).setFooter({ text: askFooterText(result, context) });
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

export type AskMode = "auto" | "verify" | "autopsy" | "scenario";

export interface AskRequestOptions {
  question: string;
  responseLength: string;
  mode?: AskMode;
  useMcp?: boolean;
  requester?: AskIdentity;
  subject?: AskIdentity;
  discordId: string;
  discordUsername: string;
  channelId: string;
  progress: AskProgressReporter;
}

/** One Ask engine round trip with live progress and streamed answer preview. */
export async function requestAsk(options: AskRequestOptions): Promise<AskResponse> {
  let meta: Partial<AskResponse> = {};
  const result = await apiPostAskSiteStream<AskResponse>(
    "/api/discord-ask/answer",
    {
      question: options.question,
      responseLength: options.responseLength,
      mode: options.mode ?? "auto",
      useMcp: options.useMcp ?? true,
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
      if (event === "meta") {
        meta = { questionTrimmed: (data as { questionTrimmed?: unknown }).questionTrimmed === true };
        return;
      }
      const label = String((data as { label?: unknown }).label || "");
      if (event === "status" && label) options.progress.status(label);
      if (event === "action" && label) options.progress.action(label);
    },
    ASK_TIMEOUT_MS,
  );
  return { ...meta, ...result, questionTrimmed: Boolean(result.questionTrimmed || meta.questionTrimmed) };
}

export interface AskMessagePayload {
  content: string;
  files?: AttachmentBuilder[];
  embeds?: EmbedBuilder[];
  components?: ActionRowBuilder<ButtonBuilder>[];
}

/** Where an answer goes: the first message replaces the placeholder, the rest follow it. */
export interface AskSink {
  first(payload: AskMessagePayload): Promise<Message>;
  more(payload: AskMessagePayload): Promise<unknown>;
}

export interface AskDeliveryTarget {
  /** Unique id scoping this answer's button custom ids (e.g. interaction or message id). */
  scopeId: string;
  /** The player who asked; only they may use the controls. */
  userId: string;
  username: string;
  question: string;
  requester?: AskIdentity;
  /** The visible placeholder message and its follow-ups. */
  sink: AskSink;
  /** Runs a suggested follow-up question from a button. */
  onFollowup?: (question: string, button: MessageComponentInteraction) => Promise<void>;
}

async function renderAttachments(text: string): Promise<{ text: string; files: AttachmentBuilder[] }> {
  const extracted = extractAskVisualizations(text);
  const files: AttachmentBuilder[] = [];
  let body = extracted.text;
  for (const visualization of extracted.visualizations) {
    try {
      const image = visualization.kind === "map"
        ? await renderAskMapPng(visualization.source)
        : renderAskVisualizationPng(visualization.source);
      if (!image) {
        body += `\n\n*(This answer includes a diagram Discord can't show. Open it on ${ASK_SITE_ORIGIN.replace(/^https?:\/\//, "")}.)*`;
        continue;
      }
      files.push(new AttachmentBuilder(image, {
        name: `ask-${visualization.kind}-${visualization.index}.png`,
        description: visualization.kind === "map"
          ? "Live A House Divided game map generated for this Ask response"
          : "Chart generated for this Ask response",
      }));
    } catch {
      body += "\n\n*(The requested visualization could not be rendered.)*";
    }
  }
  return { text: body, files };
}

/**
 * Render a finished answer into Discord: visualizations as attachments,
 * chunked text, footer, follow-up suggestions, and the feedback controls with
 * their full lifecycle (one rating per answer, truthful confirmations,
 * disabled on expiry). Returns the delivered answer message.
 */
export async function deliverAskAnswer(target: AskDeliveryTarget, result: AskResponse): Promise<Message> {
  return deliverTo(target.sink, target, result);
}

async function deliverTo(sink: AskSink, target: AskDeliveryTarget, result: AskResponse): Promise<Message> {
  const rendered = await renderAttachments(formatForDiscord(result.answer));

  // Keep the channel answer-first. Source detail is still available through
  // the button, or inline when the player explicitly asks for it.
  let fullMessage = rendered.text;
  if (asksForSources(target.question)) {
    const sources = compactSources(result);
    if (sources) fullMessage += `\n\n**Sources**\n${sources}`;
  }

  const followups = (result.followups || []).filter(q => typeof q === "string" && q.trim()).slice(0, 3);
  const followupsLeft = typeof result.followupsLeft === "number" ? result.followupsLeft : null;
  const showFollowups = Boolean(target.onFollowup) && followups.length > 0 && followupsLeft !== 0;
  const components = (state: Parameters<typeof askActions>[1] = {}) => {
    const rows = [askActions(target.scopeId, { ...state, reportUrl: result.reportUrl ? `${ASK_SITE_ORIGIN}${result.reportUrl}` : undefined })];
    if (showFollowups) rows.push(askFollowupRow(target.scopeId, followups, Boolean(state.allDisabled)));
    return rows;
  };

  const chunks = splitDiscordContent(fullMessage);
  const reply = await sink.first({
    content: chunks[0] || "I couldn't produce an answer for that one.",
    files: rendered.files,
    embeds: [askFooter(result, { requester: target.requester })],
    components: components(),
  });
  for (const chunk of chunks.slice(1)) {
    await sink.more({ content: chunk });
  }

  // No `max`: a capped collector was consumed by ANY component click, after
  // which the asker's own Report button silently died. One rating per answer
  // is enforced explicitly, and the row re-renders so state is visible.
  const collector = reply.createMessageComponentCollector({
    time: 14 * 60_000,
    filter: button => button.customId.endsWith(`:${target.scopeId}`),
  });
  let rated: "up" | "down" | null = null;
  let followupUsed = false;
  const feedbackBody = (rating: "up" | "down", reason?: string): Record<string, unknown> => ({
    discordId: target.userId, username: target.username, question: target.question,
    answer: result.answer, answerId: result.answerId, rating,
    ...(reason ? { reason } : {}),
    usedMcp: Boolean(result.usedMcp ?? result.liveDataUsed),
  });
  const rerender = async () => {
    try {
      await reply.edit({ components: components({ ratingDisabled: Boolean(rated), ratedLabel: rated ?? undefined }) });
    } catch { /* cosmetic */ }
  };
  collector.on("collect", async button => {
    if (button.user.id !== target.userId) {
      await button.reply({ content: "Only the person who asked can use these controls.", ephemeral: true });
      return;
    }
    const kind = button.customId.split(":")[0];
    if (kind === "ask-sources") {
      await button.reply({ content: `**Sources**\n${compactSources(result) || "No compact source list was returned."}`, ephemeral: true, allowedMentions: ASK_MENTIONS });
      return;
    }
    if (kind === "ask-fu") {
      const index = Number(button.customId.split(":")[1]);
      const question = followups[index];
      if (!question || !target.onFollowup) return;
      if (followupUsed) {
        await button.reply({ content: "You already asked a suggested follow-up from this answer.", ephemeral: true });
        return;
      }
      followupUsed = true;
      await target.onFollowup(question, button);
      return;
    }
    if (rated) {
      await button.reply({ content: "Feedback for this answer is already recorded.", ephemeral: true });
      return;
    }
    if (kind === "ask-good") {
      const sent = await submitFeedback(feedbackBody("up"));
      if (sent?.ok) {
        rated = "up";
        await rerender();
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
        rated = "down";
        await rerender();
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
    try { await reply.edit({ components: components({ allDisabled: true, ratedLabel: rated ?? undefined }) }); } catch { /* message may be gone */ }
  });

  return reply;
}
