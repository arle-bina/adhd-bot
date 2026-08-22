const DEFAULT_DISCORD_LIMIT = 2000;

function nextFenceState(text: string, current: string | null): string | null {
  const fences = text.matchAll(/```([^\n`]*)/g);
  let state = current;
  for (const fence of fences) {
    state = state === null ? (fence[1]?.trim() ?? "") : null;
  }
  return state;
}

function chooseBreak(text: string, limit: number): number {
  if (text.length <= limit) return text.length;
  const floor = Math.floor(limit * 0.45);
  for (const separator of ["\n\n", "\n", " "]) {
    const index = text.lastIndexOf(separator, limit);
    if (index >= floor) return index + separator.length;
  }
  return limit;
}

/** Split Markdown into Discord-sized messages while balancing code fences. */
export function splitDiscordContent(
  content: string,
  limit = DEFAULT_DISCORD_LIMIT,
): string[] {
  if (limit < 32) throw new RangeError("Discord message limit must be at least 32 characters");

  let remaining = content.trim();
  if (!remaining) return [];

  const chunks: string[] = [];
  let openFence: string | null = null;

  while (remaining) {
    const prefix = openFence === null ? "" : `\`\`\`${openFence}\n`;
    // Reserve room to close a fence. This keeps every individual Discord
    // message valid even when one code block spans several messages.
    const rawBudget = limit - prefix.length - 4;
    const cut = chooseBreak(remaining, rawBudget);
    const raw = remaining.slice(0, cut).replace(/\s+$/, "");
    const afterFence = nextFenceState(raw, openFence);
    const suffix = afterFence === null ? "" : "\n```";
    const chunk = `${prefix}${raw}${suffix}`;
    if (chunk) chunks.push(chunk);

    remaining = remaining.slice(cut);
    remaining = afterFence === null
      ? remaining.replace(/^\s+/, "")
      : remaining.replace(/^\n+/, "");
    openFence = afterFence;
  }

  return chunks;
}
