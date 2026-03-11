export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export function errorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : "";
  if (msg.includes("401")) return "Bot configuration error — contact an admin.";
  if (msg.includes("400")) return "Invalid request — check your inputs.";
  if (msg.includes("API error")) return "Something went wrong. Try again shortly.";
  return "Could not reach the game server. Try again shortly.";
}
