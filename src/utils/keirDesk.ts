// /keir staff desk: forwards a staff command to the Keir desk on the ops box
// and relays its plain-text answer.
//
// The desk is a separate read-only process from Keir himself, so `doctor` and
// `status` still answer when Keir is stuck. It owns the role table and decides
// what each role may run; this side only reports who asked (their Discord id
// and role ids, taken from the interaction) and prints what comes back.
//
// Auth is the credential this bot already holds for ops (ASK_SECRET on the
// X-Ask-Secret header, as /ask and /reassess use). No new token or Discord
// application is involved.

const DESK_TIMEOUT_MS = 30_000;
const DEFAULT_OPS_URL = "https://ops.lakesidegames.net";

export const KEIR_DESK_SUBCOMMANDS = [
  { name: "doctor", description: "Why a ticket (or Keir) is stuck, and what to do", ticket: "optional" },
  { name: "status", description: "Keir on or off, model, and ticket counts", ticket: "none" },
  { name: "waiting", description: "Tickets waiting on a person", ticket: "none" },
  { name: "why", description: "What Keir did on a ticket", ticket: "required" },
  { name: "nudge", description: "Make Keir look at a ticket again (junior devs and devs)", ticket: "required" },
  { name: "release", description: "Release a ticket Keir is holding (junior devs and devs)", ticket: "required" },
  { name: "pause", description: "Pause Keir (junior devs and devs)", ticket: "none" },
  { name: "resume", description: "Resume Keir (junior devs and devs)", ticket: "none" },
  { name: "model", description: "Show or set Keir's model (devs)", ticket: "none" },
  { name: "on", description: "Turn Keir on (devs)", ticket: "none" },
  { name: "off", description: "Turn Keir off (devs)", ticket: "none" },
] as const;

export type KeirDeskSub = (typeof KEIR_DESK_SUBCOMMANDS)[number]["name"];

export interface KeirDeskCall {
  sub: KeirDeskSub;
  options: { ticket?: number; name?: string; share?: boolean };
  member: { id: string; roles: string[] };
}

export interface KeirDeskReply {
  content: string;
  /** False only when the desk allows this answer to be shown to the channel. */
  ephemeral: boolean;
}

function opsBaseUrl(): string {
  return process.env.OPS_DASHBOARD_URL || DEFAULT_OPS_URL;
}

/** Never throws: every failure comes back as a private, readable line. */
export async function callKeirDesk(call: KeirDeskCall): Promise<KeirDeskReply> {
  const secret = process.env.ASK_SECRET || process.env.ASK_API_SECRET;
  if (!secret) return { content: "The Keir desk is not set up on this bot yet (no ops credential).", ephemeral: true };

  try {
    const url = new URL("/api/keir/desk/command", opsBaseUrl());
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Ask-Secret": secret },
      body: JSON.stringify({ command: "keir", ...call }),
      signal: AbortSignal.timeout(DESK_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[keirDesk] ${response.status} ${(await response.text().catch(() => "")).slice(0, 200)}`);
      return { content: `The Keir desk did not answer (HTTP ${response.status}). Keir himself may still be fine.`, ephemeral: true };
    }
    const body = (await response.json()) as Partial<KeirDeskReply>;
    const content = typeof body.content === "string" && body.content.trim() ? body.content.slice(0, 1900) : "The desk sent an empty answer.";
    return { content, ephemeral: body.ephemeral !== false };
  } catch (err) {
    console.error("[keirDesk] error:", err);
    return { content: "Couldn't reach the ops box, so the Keir desk can't answer right now.", ephemeral: true };
  }
}
