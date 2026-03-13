const DEFAULT_EMBED_COLOR = 0x5865f2; // Discord blurple

export function hexToInt(hex: string | null | undefined): number {
  if (!hex) return DEFAULT_EMBED_COLOR;
  const parsed = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(parsed) ? DEFAULT_EMBED_COLOR : parsed;
}

export function errorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : "";
  if (msg.includes("401")) return "Bot configuration error — contact an admin.";
  if (msg.includes("400")) return "Invalid request — check your inputs.";
  if (msg.includes("API error")) return "Something went wrong. Try again shortly.";
  return "Could not reach the game server. Try again shortly.";
}
