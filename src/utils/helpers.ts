const DEFAULT_EMBED_COLOR = 0x5865f2; // Discord blurple

export function hexToInt(hex: string | null | undefined): number {
  if (!hex) return DEFAULT_EMBED_COLOR;
  const parsed = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(parsed) ? DEFAULT_EMBED_COLOR : parsed;
}

export function errorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : "";
  const statusMatch = msg.match(/\b(\d{3})\b/);
  const code = statusMatch ? ` (${statusMatch[1]})` : "";

  if (msg.includes("401")) return `Bot configuration error${code} — contact an admin.`;
  if (msg.includes("400")) return `Invalid request${code} — check your inputs.`;
  if (msg.includes("API error")) return `Something went wrong${code}. Try again shortly.`;

  // AbortSignal.timeout() fires a TimeoutError (a DOMException subclass)
  if (error instanceof Error && error.name === "TimeoutError") {
    return "The game server took too long to respond. Try again shortly.";
  }

  // fetch() throws a TypeError on network-level failures (ECONNREFUSED, ENOTFOUND, etc.)
  if (error instanceof TypeError && msg === "fetch failed") {
    return "Could not reach the game server. Try again shortly.";
  }

  return "An unexpected error occurred. Try again shortly.";
}

/**
 * Log a structured error from a command handler and return a user-facing message.
 *
 * Server logs include: timestamp, command name, error message, and stack trace.
 * The returned string is safe to send directly to Discord.
 */
export function logCommandError(command: string, error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`[${command}] ${new Date().toISOString()} — ${msg}`);
  if (stack) console.error(stack);
  return errorMessage(error);
}
