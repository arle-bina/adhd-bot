import type { Client } from "discord.js";
import { ApiError, apiPostAskSite } from "./api-base.js";
import { ASK_MENTIONS } from "./ask-safety.js";

// Ask watchlists ("watch USD/GBP above 1.30") are created by asking. When one
// fires, the engine queues an alert; this delivers Discord users' alerts by DM.

export interface AskWatch {
  id: string | number;
  kind?: string;
  label: string;
  createdAt?: string | number;
  lastFiredAt?: string | number | null;
}

export interface AskWatchEvent {
  discordId: string;
  id?: string | number;
  label?: string;
  message?: string;
  firedAt?: string | number;
}

export async function listAskWatches(discordId: string): Promise<{ watches: AskWatch[]; limit?: number }> {
  const result = await apiPostAskSite<{ watches?: AskWatch[]; limit?: number }>("/api/discord-ask/watches", { discordId });
  return { watches: Array.isArray(result.watches) ? result.watches : [], limit: result.limit };
}

export async function deleteAskWatch(discordId: string, id: string | number): Promise<boolean> {
  const result = await apiPostAskSite<{ ok?: boolean }>("/api/discord-ask/watches/delete", { discordId, id });
  return result.ok === true;
}

export function watchAlertText(event: AskWatchEvent): string {
  const label = String(event.label || "Your Ask watch").replace(/\s+/g, " ").slice(0, 200);
  const body = String(event.message || "").trim().slice(0, 1500);
  return [`**Ask watch alert:** ${label}`, body, "-# Manage watches with /ask-watches"].filter(Boolean).join("\n");
}

const POLL_MS = Number(process.env.ASK_WATCH_POLL_MS || 5 * 60_000);
const MISSING_BACKOFF_MS = 60 * 60_000;

/** Poll for fired watches and DM them. Never throws; an older engine just backs off. */
export function startAskWatchPoller(client: Client): void {
  if (!(process.env.ASK_SECRET || process.env.ASK_API_SECRET) || POLL_MS <= 0) return;
  const tick = async (): Promise<number> => {
    try {
      const { events } = await apiPostAskSite<{ events?: AskWatchEvent[] }>("/api/discord-ask/watch-events", { limit: 50 });
      for (const event of Array.isArray(events) ? events : []) {
        if (!event?.discordId) continue;
        try {
          const user = await client.users.fetch(event.discordId);
          await user.send({ content: watchAlertText(event), allowedMentions: ASK_MENTIONS });
        } catch (error) {
          // Closed DMs are the player's choice; the alert still shows on the web.
          console.warn("[ask] watch alert DM failed:", error instanceof Error ? error.message : String(error));
        }
      }
      return POLL_MS;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return MISSING_BACKOFF_MS;
      console.warn("[ask] watch poll failed:", error instanceof Error ? error.message : String(error));
      return POLL_MS;
    }
  };
  const schedule = (delay: number) => {
    const timer = setTimeout(async () => schedule(await tick()), delay);
    timer.unref?.();
  };
  schedule(30_000);
}
