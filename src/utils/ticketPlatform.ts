// Where a reporter is actually playing when they hit a problem.
//
// The same bug behaves differently across the five surfaces the game ships on,
// and "it's broken" with no platform costs a round trip before anyone can even
// try to reproduce it. Asking at intake is the cheapest possible fix.

import type { TicketCategory } from "./ticketStore.js";

export const TICKET_PLATFORM_FIELD_ID = "ticket_platform";

export interface TicketPlatformOption {
  value: string;
  label: string;
  description: string;
  emoji: string;
}

/** Ordered as the picker shows them: mobile first, then desktop. */
export const TICKET_PLATFORMS = [
  {
    value: "mobile_web",
    label: "Mobile: web browser",
    description: "Playing in a browser on a phone or tablet",
    emoji: "📱",
  },
  {
    value: "mobile_android",
    label: "Mobile: Android app",
    description: "Playing in the Android app",
    emoji: "🤖",
  },
  {
    value: "desktop_web",
    label: "Desktop: web browser",
    description: "Playing in a browser on a computer",
    emoji: "🌐",
  },
  {
    value: "desktop_client",
    label: "Desktop: client app",
    description: "Playing in the downloadable desktop client",
    emoji: "🖥️",
  },
  {
    value: "desktop_singleplayer",
    label: "Desktop: single player",
    description: "Playing a single player game in the desktop client",
    emoji: "🎮",
  },
] as const satisfies readonly TicketPlatformOption[];

export type TicketPlatform = (typeof TICKET_PLATFORMS)[number]["value"];

const LABELS: Record<string, string> = Object.fromEntries(
  TICKET_PLATFORMS.map((p) => [p.value, p.label]),
);

export function isTicketPlatform(value: unknown): value is TicketPlatform {
  return typeof value === "string" && value in LABELS;
}

/** Human label for a stored platform value; unknown values pass through unchanged. */
export function formatTicketPlatform(value: string): string {
  return LABELS[value] ?? value;
}

/**
 * Only bug reports get asked. Moderation reports are about people, and mechanics
 * questions are about rules. Neither answer changes with the client.
 */
export function categoryNeedsPlatform(category: TicketCategory): boolean {
  return category === "bug";
}

/** Plain-text fallback prompt for ticket paths that never showed the picker. */
export const PLATFORM_PROMPT_OPTIONS = TICKET_PLATFORMS.map((p) => `**${p.label}**`).join(", ");
