const DEFAULT_EMBED_COLOR = 0x5865f2; // Discord blurple

export function hexToInt(hex: string | null | undefined): number {
  if (!hex) return DEFAULT_EMBED_COLOR;
  const parsed = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(parsed) ? DEFAULT_EMBED_COLOR : parsed;
}

export function errorMessage(error: unknown, command?: string): string {
  const prefix = command ? `[/${command}] ` : "";
  const msg = error instanceof Error ? error.message : String(error);

  // User-facing hint based on error category
  let hint: string;
  if (msg.includes("401") || msg.includes("403"))
    hint = "Bot authorization failed — contact an admin.";
  else if (msg.includes("400"))
    hint = "Invalid request — check your inputs.";
  else if (msg.includes("404"))
    hint = "The game API endpoint was not found — the bot may need an update.";
  else if (msg.includes("5"))
    hint = "The game server returned an error. Try again shortly.";
  else if (msg.includes("API error"))
    hint = "Something went wrong talking to the game server.";
  else if (msg.includes("fetch") || msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT"))
    hint = "Could not reach the game server. Try again shortly.";
  else
    hint = "An unexpected error occurred.";

  // Append a short diagnostic so the user can relay it to a dev
  const detail = msg.length > 0 && msg.length <= 120 ? msg : msg.slice(0, 120) + "…";
  return `${prefix}${hint}\n-# Error: ${detail}`;
}
