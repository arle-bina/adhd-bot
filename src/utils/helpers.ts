import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ChatInputCommandInteraction,
} from "discord.js";

const DEFAULT_EMBED_COLOR = 0x5865f2; // Discord blurple
const ERROR_COLOR = 0xed4245; // Discord red
const ERRORS_PER_PAGE = 3;

export const SITE_FOOTER = "ahousedividedgame.com";

/**
 * Normalise a URL returned by the game API so it always uses the configured
 * GAME_API_URL origin. The API can return stale Next.js NEXT_PUBLIC_BASE_URL
 * values (e.g. localhost:3000) — this replaces the origin while keeping the
 * path, query, and hash intact.
 */
export function normalizeGameUrl(href: string): string {
  let origin: string;
  try {
    origin = new URL(process.env.GAME_API_URL!).origin;
  } catch {
    origin = "https://www.ahousedividedgame.com";
  }
  try {
    const u = new URL(href);
    return new URL(u.pathname + u.search + u.hash, origin).href;
  } catch {
    // href was a bare path — resolve against origin
    return new URL(href, origin).href;
  }
}

export function standardFooter(extra?: string): { text: string } {
  return { text: extra ? `${extra} · ${SITE_FOOTER}` : SITE_FOOTER };
}

export function positionBar(val: number, width = 10): string {
  const normalised = (val + 100) / 200; // 0..1
  const filled = Math.round(normalised * width);
  return "\u25C0" + "\u2500".repeat(Math.max(0, filled - 1)) + "\u25CF" + "\u2500".repeat(Math.max(0, width - filled)) + "\u25B6";
}

export function hexToInt(hex: string | null | undefined): number {
  if (!hex) return DEFAULT_EMBED_COLOR;
  const parsed = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(parsed) ? DEFAULT_EMBED_COLOR : parsed;
}

// ---------------------------------------------------------------------------
// Error detail extraction
// ---------------------------------------------------------------------------

interface ErrorDetail {
  name: string;
  message: string;
  code: string | undefined;
  stack: string | undefined;
  endpoint: string | undefined;
  status: number | undefined;
  responseBody: string | undefined;
}

function extractDetail(error: unknown): ErrorDetail {
  if (error instanceof Error) {
    const apiFields = error.name === "ApiError"
      ? {
          endpoint: (error as Error & { endpoint: string }).endpoint,
          status: (error as Error & { status: number }).status,
          responseBody: (error as Error & { responseBody: string }).responseBody,
        }
      : { endpoint: undefined, status: undefined, responseBody: undefined };

    // If this error's message is unhelpful but it has a cause, prefer the cause's message
    const cause = (error as Error & { cause?: unknown }).cause;
    let message = error.message;
    const isUninformativeMessage =
      !message ||
      message === "0" ||
      message.includes("Received one or more errors") ||
      /^\d+,/.test(message);
    if (isUninformativeMessage) {
      if (cause instanceof Error && cause.message) {
        message = cause.message;
      } else {
        message = "Connection failed — network or DNS error.";
      }
    }

    return {
      name: error.name,
      message,
      code: (error as NodeJS.ErrnoException).code,
      stack: error.stack,
      ...apiFields,
    };
  }
  return { name: "Error", message: String(error), code: undefined, stack: undefined, endpoint: undefined, status: undefined, responseBody: undefined };
}

/** Unwrap AggregateError (and nested ones) into a flat list of sub-errors. */
function collectErrors(error: unknown): ErrorDetail[] {
  const details: ErrorDetail[] = [];

  if (
    error instanceof Error &&
    "errors" in error &&
    Array.isArray((error as AggregateError).errors)
  ) {
    for (const sub of (error as AggregateError).errors) {
      // Recurse one level in case of nested AggregateErrors
      if (
        sub instanceof Error &&
        "errors" in sub &&
        Array.isArray((sub as AggregateError).errors)
      ) {
        for (const nested of (sub as AggregateError).errors) {
          details.push(extractDetail(nested));
        }
      } else {
        details.push(extractDetail(sub));
      }
    }
  }

  if (details.length === 0) {
    details.push(extractDetail(error));
  }

  return details;
}

/** Pull unique stack frames from our own code across all (sub-)errors. */
function buildStackExcerpt(error: unknown): string {
  const stacks: string[] = [];

  if (error instanceof Error && error.stack) stacks.push(error.stack);

  if (
    error instanceof Error &&
    "errors" in error &&
    Array.isArray((error as AggregateError).errors)
  ) {
    for (const sub of (error as AggregateError).errors) {
      if (sub instanceof Error && sub.stack) stacks.push(sub.stack);
    }
  }

  const seen = new Set<string>();
  const frames: string[] = [];
  for (const stack of stacks) {
    for (const line of stack.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.includes("/src/") && !seen.has(trimmed)) {
        seen.add(trimmed);
        frames.push(trimmed);
      }
    }
  }

  return frames.slice(0, 6).join("\n");
}

// ---------------------------------------------------------------------------
// Human-readable summary (used in embed title)
// ---------------------------------------------------------------------------

/** Collect error codes by walking .cause chains and AggregateError sub-errors. */
function collectErrorCodes(err: unknown, depth = 0): string[] {
  if (depth > 5) return [];
  const codes: string[] = [];
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code) codes.push(code);
    // Walk .cause chain
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause) codes.push(...collectErrorCodes(cause, depth + 1));
    // Recurse into AggregateError sub-errors
    if ("errors" in err && Array.isArray((err as AggregateError).errors)) {
      for (const sub of (err as AggregateError).errors) {
        codes.push(...collectErrorCodes(sub, depth + 1));
      }
    }
  }
  return codes;
}

const NETWORK_CODE_LABELS: Record<string, string> = {
  ECONNREFUSED: "connection refused",
  ENOTFOUND: "DNS lookup failed",
  ETIMEDOUT: "connection timed out",
  ECONNRESET: "connection reset",
  UND_ERR_CONNECT_TIMEOUT: "connection timed out",
  UND_ERR_SOCKET: "socket error",
};

/** Try to produce a user-friendly message from a .cause (typically from TypeError: fetch failed). */
function describeNetworkCause(cause: unknown): string | null {
  const codes = collectErrorCodes(cause);
  const unique = [...new Set(codes)];
  if (unique.length === 0) return null;

  const labels = unique.map((c) => NETWORK_CODE_LABELS[c] ?? c);
  return `Could not reach the game server — ${labels.join(", ")}. Try again shortly.`;
}

/** Try to produce a user-friendly message from an AggregateError (common from Node fetch). */
function describeAggregateNetwork(err: AggregateError): string | null {
  const codes = collectErrorCodes(err);
  const unique = [...new Set(codes)];
  if (unique.length > 0) {
    const labels = unique.map((c) => NETWORK_CODE_LABELS[c] ?? c);
    return `Could not reach the game server — ${labels.join(", ")}. Try again shortly.`;
  }

  // Generic undici AggregateError with unhelpful "Received one or more errors" message
  if (
    err.message.includes("Received one or more errors") ||
    err.message === "" ||
    err.message === "0"
  ) {
    return "Could not reach the game server — connection failed. Try again shortly.";
  }

  return null;
}

export function errorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  // --- ApiError from our own api.ts — richest information available ---
  if (error instanceof Error && error.name === "ApiError") {
    const apiErr = error as Error & { status: number; endpoint: string; responseBody: string };
    const { status, endpoint, responseBody } = apiErr;

    if (status === 401) return `Authentication failed (401) on ${endpoint} — bot API key may be invalid. Contact an admin.`;
    if (status === 403) return `Forbidden (403) on ${endpoint} — bot does not have permission. Contact an admin.`;
    if (status === 404) return `Not found (404) on ${endpoint} — this API endpoint may not exist or the resource was not found.`;
    if (status === 400) {
      const detail = responseBody.slice(0, 150);
      return `Bad request (400) on ${endpoint}: ${detail || "check your inputs."}`;
    }
    if (status === 429) return `Rate limited (429) on ${endpoint} — too many requests. Try again in a minute.`;
    if (status >= 500) {
      const detail = responseBody.slice(0, 100);
      return `Game server error (${status}) on ${endpoint}: ${detail || "the server had an internal error. Try again shortly."}`;
    }
    return `API error (${status}) on ${endpoint}: ${responseBody.slice(0, 150) || "unknown error"}`;
  }

  // --- Legacy API error format (fallback) ---
  const statusMatch = msg.match(/\b(\d{3})\b/);
  const code = statusMatch ? ` (${statusMatch[1]})` : "";

  if (msg.includes("401")) return `Bot configuration error${code} — contact an admin.`;
  if (msg.includes("400")) return `Invalid request${code} — check your inputs.`;
  if (msg.includes("API error")) return `Game API error${code}. Try again shortly.`;

  // --- Network / timeout errors ---
  if (error instanceof Error && error.name === "TimeoutError") {
    return "The game server took too long to respond (10s timeout). Try again shortly.";
  }

  if (error instanceof TypeError && msg === "fetch failed") {
    // Node's undici often wraps the real error in .cause
    const networkMsg = describeNetworkCause((error as Error & { cause?: unknown }).cause);
    return networkMsg ?? "Could not reach the game server — connection refused or DNS failure. Try again shortly.";
  }

  // --- AggregateError — usually a network failure from fetch ---
  if (
    error instanceof Error &&
    "errors" in error &&
    Array.isArray((error as AggregateError).errors)
  ) {
    const networkMsg = describeAggregateNetwork(error as AggregateError);
    if (networkMsg) return networkMsg;

    const subs = (error as AggregateError).errors as Error[];
    const subMsgs = subs
      .map((e) => (e instanceof Error ? e.message : String(e)))
      .filter((m) => m && m !== "0" && m !== "undefined");
    if (subMsgs.length === 0) {
      return "Could not reach the game server — connection failed. Try again shortly.";
    }
    return `Multiple errors: ${subMsgs.join("; ").slice(0, 200)}`;
  }

  // --- Discord.js API errors ---
  if (error instanceof Error && "code" in error && "requestBody" in error) {
    const discordCode = (error as Error & { code: number }).code;
    return `Discord API error (code ${discordCode}): ${msg.slice(0, 200)}`;
  }

  // --- Catch-all: show error name + message for maximum clarity ---
  const name = error instanceof Error ? error.name : "Error";
  const errCode = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  const codeStr = errCode ? ` [${errCode}]` : "";
  return `${name}${codeStr}: ${msg.slice(0, 200)}`;
}

// ---------------------------------------------------------------------------
// Error embed builder
// ---------------------------------------------------------------------------

function buildErrorPages(
  command: string,
  summary: string,
  errors: ErrorDetail[],
  stackExcerpt: string,
): EmbedBuilder[] {
  const pages: EmbedBuilder[] = [];
  const totalErrors = errors.length;
  const totalPages = Math.max(1, Math.ceil(totalErrors / ERRORS_PER_PAGE));

  for (let p = 0; p < totalPages; p++) {
    const embed = new EmbedBuilder()
      .setColor(ERROR_COLOR)
      .setTitle(`/${command} — Error`)
      .setDescription(summary)
      .setTimestamp()
      .setFooter({
        text:
          totalPages > 1
            ? `Page ${p + 1}/${totalPages} · ${totalErrors} error(s) · ahousedividedgame.com`
            : `${totalErrors} error(s) · ahousedividedgame.com`,
      });

    const pageErrors = errors.slice(p * ERRORS_PER_PAGE, (p + 1) * ERRORS_PER_PAGE);

    for (let i = 0; i < pageErrors.length; i++) {
      const err = pageErrors[i];
      const idx = p * ERRORS_PER_PAGE + i + 1;
      const label = totalErrors > 1 ? `Error ${idx}/${totalErrors}` : "Details";

      const parts: string[] = [];
      parts.push(`**Type:** \`${err.name}\``);
      if (err.code) parts.push(`**Code:** \`${err.code}\``);
      if (err.status) parts.push(`**HTTP Status:** \`${err.status}\``);
      if (err.endpoint) parts.push(`**Endpoint:** \`${err.endpoint}\``);
      parts.push(`**Message:** ${err.message.slice(0, 300)}`);

      embed.addFields({ name: label, value: parts.join("\n").slice(0, 1024) });

      // Show API response body if available (separate field for readability)
      if (err.responseBody && err.responseBody.length > 0) {
        embed.addFields({
          name: "API Response",
          value: `\`\`\`\n${err.responseBody.slice(0, 900)}\n\`\`\``,
        });
      }
    }

    // Show stack excerpt on the first page
    if (p === 0 && stackExcerpt) {
      embed.addFields({
        name: "Stack Trace",
        value: `\`\`\`\n${stackExcerpt.slice(0, 900)}\n\`\`\``,
      });
    }

    pages.push(embed);
  }

  return pages;
}

function buildPageRow(
  currentPage: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("err_prev")
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId("err_next")
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === totalPages - 1),
  );
}

// ---------------------------------------------------------------------------
// Console logger (still useful for server-side logs)
// ---------------------------------------------------------------------------

export function logCommandError(command: string, error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`[${command}] ${new Date().toISOString()} — ${msg}`);
  if (stack) console.error(stack);

  // Also log sub-errors for AggregateError
  if (
    error instanceof Error &&
    "errors" in error &&
    Array.isArray((error as AggregateError).errors)
  ) {
    for (const sub of (error as AggregateError).errors) {
      const subMsg = sub instanceof Error ? sub.message : String(sub);
      const subStack = sub instanceof Error ? sub.stack : undefined;
      console.error(`  ↳ ${subMsg}`);
      if (subStack) console.error(subStack);
    }
  }

  return errorMessage(error);
}

// ---------------------------------------------------------------------------
// Primary error reply — replaces all `interaction.editReply({ content: ... })`
// calls in command catch blocks. Sends a rich embed with full error detail and
// pagination buttons when there are many sub-errors.
// ---------------------------------------------------------------------------

export async function replyWithError(
  interaction: ChatInputCommandInteraction,
  command: string,
  error: unknown,
): Promise<void> {
  // Log to console
  logCommandError(command, error);

  // Build embed pages
  const errors = collectErrors(error);
  const stackExcerpt = buildStackExcerpt(error);
  const summary = errorMessage(error);
  const pages = buildErrorPages(command, summary, errors, stackExcerpt);

  if (pages.length === 1) {
    await interaction.editReply({ embeds: [pages[0]], content: "" });
    return;
  }

  // Paginated error display
  let page = 0;
  const message = await interaction.editReply({
    embeds: [pages[0]],
    components: [buildPageRow(0, pages.length)],
    content: "",
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
  });

  collector.on("collect", async (btn) => {
    if (btn.user.id !== interaction.user.id) {
      await btn.reply({ content: "This isn't your error report.", ephemeral: true });
      return;
    }

    await btn.deferUpdate();
    if (btn.customId === "err_prev") page = Math.max(0, page - 1);
    if (btn.customId === "err_next") page = Math.min(pages.length - 1, page + 1);
    await btn.editReply({
      embeds: [pages[page]],
      components: [buildPageRow(page, pages.length)],
    });
  });

  collector.on("end", () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}
