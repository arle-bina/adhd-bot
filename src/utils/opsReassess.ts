// Trigger the ops dashboard's GitHub triage for one game support ticket.
//
// Kept separate from the handoff client because that one is still in flight:
// this needs only the dashboard URL and the bot's scoped agent token, both of
// which already exist in this bot's environment. Best-effort like the other
// dashboard calls — a dashboard outage returns undefined so the command can say
// so instead of throwing.

const REASSESS_TIMEOUT_MS = 30_000;

export interface ReassessResponse {
  started: boolean;
  ticket: number;
  opsUrl: string;
}

function opsConfigured(): boolean {
  return Boolean(process.env.OPS_DASHBOARD_URL && process.env.OPS_HANDOFF_TOKEN);
}

/**
 * Ask the dashboard to re-run the ticket's GitHub triage: reclassify it, check
 * whether a merged PR already fixes it, and re-link related issues. The
 * dashboard answers immediately and works in the background, so the reply is a
 * link to the ticket's page rather than a result.
 */
export async function reassessTicket(
  apiTicketNumber: number,
  requestedBy: string,
): Promise<ReassessResponse | undefined> {
  if (!opsConfigured()) return undefined;
  try {
    const url = new URL(`/api/tickets/${apiTicketNumber}/reassess`, process.env.OPS_DASHBOARD_URL);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPS_HANDOFF_TOKEN}`,
      },
      body: JSON.stringify({ requestedBy }),
      signal: AbortSignal.timeout(REASSESS_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[opsReassess] failed: ${response.status} ${(await response.text().catch(() => "")).slice(0, 200)}`);
      return undefined;
    }
    return (await response.json()) as ReassessResponse;
  } catch (err) {
    console.error("[opsReassess] error:", err);
    return undefined;
  }
}
