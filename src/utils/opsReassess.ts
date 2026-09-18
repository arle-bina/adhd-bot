// Trigger the ops dashboard's GitHub triage for one game support ticket.
//
// Auth is whatever this bot already holds for ops: ASK_SECRET (ops-dash calls it
// ASK_API_SECRET) on the X-Ask-Secret header, which is what /ask uses today. A
// scoped OPS_HANDOFF_TOKEN is sent as a bearer as well when it is configured, so
// this keeps working once agent tokens are the norm. Requiring the handoff token
// here was wrong: it is not part of this bot's deployed environment.

const REASSESS_TIMEOUT_MS = 30_000;
const DEFAULT_OPS_URL = "https://ops.lakesidegames.net";

export interface ReassessResponse {
  started: boolean;
  ticket: number;
  opsUrl: string;
}

export type ReassessResult =
  | { ok: true; data: ReassessResponse }
  | { ok: false; reason: string };

function opsBaseUrl(): string {
  return process.env.OPS_DASHBOARD_URL || DEFAULT_OPS_URL;
}

export function opsConfigured(): boolean {
  return Boolean(process.env.ASK_SECRET || process.env.ASK_API_SECRET || process.env.OPS_HANDOFF_TOKEN);
}

/**
 * Ask the dashboard to re-run the ticket's GitHub triage: reclassify it, check
 * whether a merged PR already fixes it, and re-link related issues. The
 * dashboard answers immediately and works in the background, so the reply is a
 * link to the ticket's page rather than a result.
 *
 * Failures come back with the status and body so the command can say what went
 * wrong instead of asking someone to check environment variables.
 */
export async function reassessTicket(apiTicketNumber: number, requestedBy: string): Promise<ReassessResult> {
  const askSecret = process.env.ASK_SECRET || process.env.ASK_API_SECRET;
  const handoffToken = process.env.OPS_HANDOFF_TOKEN;
  if (!askSecret && !handoffToken) {
    return { ok: false, reason: "no ops credential configured (ASK_SECRET)" };
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (askSecret) headers["X-Ask-Secret"] = askSecret;
  if (handoffToken) headers.Authorization = `Bearer ${handoffToken}`;

  try {
    const url = new URL(`/api/tickets/${apiTicketNumber}/reassess`, opsBaseUrl());
    const response = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({ requestedBy }),
      signal: AbortSignal.timeout(REASSESS_TIMEOUT_MS),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[opsReassess] ${response.status} ${body.slice(0, 200)}`);
      return { ok: false, reason: `ops dashboard answered ${response.status}${body ? `: ${body.slice(0, 120)}` : ""}` };
    }
    return { ok: true, data: (await response.json()) as ReassessResponse };
  } catch (err) {
    console.error("[opsReassess] error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `could not reach ${opsBaseUrl()} (${message.slice(0, 120)})` };
  }
}
