import { randomBytes } from "node:crypto";
import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";

const DEFAULT_EMBED_COLOR = 0x5865f2; // Discord blurple
const ERROR_COLOR = 0xed4245; // Discord red

export const SITE_FOOTER = "ahousedividedgame.com";

import { forexSuffix } from "./currency.js";
import { FETCH_TIMEOUT_MS } from "./api-base.js";

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
    return new URL(href, origin).href;
  }
}

export function standardFooter(extra?: string): { text: string } {
  return { text: extra ? `${extra} · ${SITE_FOOTER}` : SITE_FOOTER };
}

/**
 * Build a footer with forex awareness.
 * When displayCurrency is not the anchor (USD/rate=1), appends the conversion rate.
 */
export function forexFooter(
  rates: Record<string, number>,
  displayCurrency: string,
  extra?: string,
): { text: string } {
  const parts: string[] = [];
  if (extra) parts.push(extra);
  const fx = forexSuffix(displayCurrency, rates);
  if (fx) parts.push(fx);
  parts.push(SITE_FOOTER);
  return { text: parts.join(" · ") };
}

export function positionBar(val: number, width = 10): string {
  const normalised = (val + 5) / 10; // 0..1 for -5..+5 scale
  const filled = Math.round(Math.min(Math.max(normalised, 0), 1) * width);
  return "\u25C0" + "\u2500".repeat(Math.max(0, filled - 1)) + "\u25CF" + "\u2500".repeat(Math.max(0, width - filled)) + "\u25B6";
}

export function hexToInt(hex: string | null | undefined): number {
  if (!hex) return DEFAULT_EMBED_COLOR;
  const parsed = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(parsed) ? DEFAULT_EMBED_COLOR : parsed;
}

/**
 * Return `url` only when it is an absolute http(s) URL that Discord's embed
 * builder will accept; otherwise `undefined`. Guards `setURL`/`setThumbnail`/
 * `setImage` against relative or malformed values — e.g. a locally-stored
 * `/api/uploads/avatars/…` avatar path — which otherwise throw a validation
 * error that aborts the entire command. Pass the result straight to the embed
 * setter (which accepts `null`/`undefined` to mean "no URL").
 */
export function safeEmbedUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
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

  // Generic undici AggregateError with an unhelpful wrapper message. Only treat
  // this as a connection failure when the sub-errors carry NO useful message —
  // a genuine undici network aggregate. Validation aggregates (e.g. discord.js'
  // "@sapphire/shapeshift" combined error from setURL/setThumbnail on a bad URL)
  // ALSO use the "Received one or more errors" wrapper but carry real sub-error
  // messages like "Invalid URL"; surface those instead of mislabeling them as a
  // network failure (return null so the caller reports the real sub-errors).
  if (
    err.message.includes("Received one or more errors") ||
    err.message === "" ||
    err.message === "0"
  ) {
    const subMsgs = (err.errors as unknown[])
      .map((e) => (e instanceof Error ? e.message : String(e)))
      .filter((m) => m && m !== "0" && m !== "undefined");
    if (subMsgs.length === 0) {
      return "Could not reach the game server — connection failed. Try again shortly.";
    }
  }

  return null;
}

/**
 * Player-safe summary of an error. Never includes stack traces, endpoint
 * paths, or raw API response bodies; those go to the server log only.
 */
export function errorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  // --- ApiError from our own api layer: map by status only ---
  if (error instanceof Error && error.name === "ApiError") {
    const status = (error as Error & { status: number }).status;
    if (status === 401 || status === 403) return "The bot could not authenticate with the game server. Contact an admin.";
    if (status === 404) return "That could not be found. Check the name and try again.";
    if (status === 400) return "That request was not valid. Check your inputs.";
    if (status === 429) return "Too many requests right now. Try again in a minute.";
    if (status >= 500) return "The game server hit an error. Try again shortly.";
    return "The game server returned an unexpected response. Try again shortly.";
  }

  // --- Legacy API error format (fallback) ---
  const statusMatch = msg.match(/\b(\d{3})\b/);
  const code = statusMatch ? ` (${statusMatch[1]})` : "";

  if (msg.includes("401")) return `Bot configuration error${code} — contact an admin.`;
  if (msg.includes("400")) return `Invalid request${code} — check your inputs.`;
  if (msg.includes("API error")) return `Game API error${code}. Try again shortly.`;

  // --- Network / timeout errors ---
  if (error instanceof Error && error.name === "TimeoutError") {
    return `The game server took too long to respond (${FETCH_TIMEOUT_MS / 1000}s timeout). Try again shortly.`;
  }

  if (error instanceof TypeError && msg === "fetch failed") {
    // Node's undici often wraps the real error in .cause
    const networkMsg = describeNetworkCause((error as Error & { cause?: unknown }).cause);
    return networkMsg ?? "Could not reach the game server — connection refused or DNS failure. Try again shortly.";
  }

  // --- AggregateError: usually a network failure, sometimes embed validation ---
  if (
    error instanceof Error &&
    "errors" in error &&
    Array.isArray((error as AggregateError).errors)
  ) {
    const networkMsg = describeAggregateNetwork(error as AggregateError);
    if (networkMsg) return networkMsg;

    const subs = (error as AggregateError).errors as unknown[];
    const subMsgs = subs
      .map((e) => (e instanceof Error ? e.message : String(e)))
      .filter((m) => m && m !== "0" && m !== "undefined");
    if (subMsgs.length === 0) {
      return "Could not reach the game server — connection failed. Try again shortly.";
    }
    if (subMsgs.some((m) => /url/i.test(m))) {
      return "Part of this result had an invalid URL and could not be displayed.";
    }
    return "Part of this result could not be displayed. Try again shortly.";
  }

  // --- Discord.js API errors ---
  if (error instanceof Error && "code" in error && "requestBody" in error) {
    const discordCode = (error as Error & { code: number }).code;
    return `Discord rejected the message (code ${discordCode}). Try again shortly.`;
  }

  return "Something went wrong running that command. Try again shortly.";
}

/** Short opaque id shown to players and written to the server log so staff can match them up. */
export function newErrorRef(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}

// ---------------------------------------------------------------------------
// Server-side logging: full detail, never shown to players
// ---------------------------------------------------------------------------

function describeForLog(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error.name === "ApiError") {
    const e = error as Error & { status: number; endpoint: string; responseBody: string };
    return `ApiError ${e.status} ${e.endpoint}: ${e.responseBody.slice(0, 500)}`;
  }
  return `${error.name}: ${error.message}`;
}

export function logCommandError(command: string, error: unknown, ref?: string): string {
  const tag = ref ? ` ref=${ref}` : "";
  console.error(`[${command}]${tag} ${new Date().toISOString()} — ${describeForLog(error)}`);
  if (error instanceof Error && error.stack) console.error(error.stack);

  if (
    error instanceof Error &&
    "errors" in error &&
    Array.isArray((error as AggregateError).errors)
  ) {
    for (const sub of (error as AggregateError).errors) {
      console.error(`  ↳ ${describeForLog(sub)}`);
      if (sub instanceof Error && sub.stack) console.error(sub.stack);
    }
  }

  return errorMessage(error);
}

// ---------------------------------------------------------------------------
// Primary error reply used by command catch blocks. Players get a friendly
// message and a short reference id; the full detail stays in the server log.
// ---------------------------------------------------------------------------

export async function replyWithError(
  interaction: ChatInputCommandInteraction,
  command: string,
  error: unknown,
): Promise<void> {
  const ref = newErrorRef();
  const summary = logCommandError(command, error, ref);

  const embed = new EmbedBuilder()
    .setColor(ERROR_COLOR)
    .setTitle(`/${command} — Error`)
    .setDescription(summary)
    .setTimestamp()
    .setFooter({ text: `Ref ${ref} · ${SITE_FOOTER}` });

  await interaction.editReply({ embeds: [embed], content: "", components: [] });
}
