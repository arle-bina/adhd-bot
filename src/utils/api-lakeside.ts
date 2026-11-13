// Lakeside account service client (internal grant endpoints).
// The service enforces who may grant; the bot only forwards the invoker id.

import type { CatalogChoice } from "./grantChoices.js";

const DEFAULT_URL = "https://lakesidegames.net";
const TIMEOUT_MS = 10_000;

export interface LakesideGrant {
  id?: string;
  _id?: string;
  label?: string;
  productLabel?: string;
  scope?: string;
  productId?: string;
  expiresAt?: string | null;
  reason?: string;
}

export interface GrantResult {
  ok: boolean;
  grant: LakesideGrant;
  summary: string;
}

export interface GrantsListing {
  grants: LakesideGrant[];
  words: string[];
  access?: string[];
  claimed?: boolean;
}

/** Outcome of a call: a parsed body, or a plain-language failure. */
export type LakesideOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "not_configured" | "forbidden" | "unreachable" | "rejected"; message: string };

export function isLakesideConfigured(): boolean {
  return Boolean(process.env.LAKESIDE_ACCOUNTS_INTERNAL_TOKEN);
}

function baseUrl(): string {
  return (process.env.LAKESIDE_ACCOUNTS_URL || DEFAULT_URL).replace(/\/+$/, "");
}

export function grantId(grant: LakesideGrant): string | null {
  return grant.id ?? grant._id ?? null;
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  query: Record<string, string>,
  body?: unknown,
): Promise<LakesideOutcome<T>> {
  const token = process.env.LAKESIDE_ACCOUNTS_INTERNAL_TOKEN;
  if (!token) {
    return { ok: false, kind: "not_configured", message: "Lakeside grants are not configured on this bot." };
  }
  const url = new URL(`${baseUrl()}/account/api/internal/${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, kind: "unreachable", message: "The account service did not answer; nothing changed." };
  }

  if (response.status === 403) {
    return { ok: false, kind: "forbidden", message: "You are not allowed to grant access." };
  }
  if (response.status >= 500) {
    return { ok: false, kind: "unreachable", message: "The account service did not answer; nothing changed." };
  }
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // non-JSON body
  }
  if (!response.ok) {
    const err = (parsed as { error?: unknown } | null)?.error;
    const text = typeof err === "string" && err ? err : `The account service refused that (${response.status}); nothing changed.`;
    return { ok: false, kind: "rejected", message: text };
  }
  return { ok: true, data: parsed as T };
}

export async function fetchCatalogChoices(actorDiscordId: string): Promise<LakesideOutcome<CatalogChoice[]>> {
  const res = await call<{ choices?: CatalogChoice[] }>("GET", "catalog-choices", { actorDiscordId });
  if (!res.ok) return res;
  return { ok: true, data: Array.isArray(res.data?.choices) ? res.data.choices : [] };
}

export async function postGrant(input: {
  actorDiscordId: string;
  targetDiscordId: string;
  scope: string;
  productId?: string;
  expiresDays?: number;
  reason: string;
}): Promise<LakesideOutcome<GrantResult>> {
  return call<GrantResult>("POST", "grants", {}, {
    actorDiscordId: input.actorDiscordId,
    target: { type: "discord", id: input.targetDiscordId },
    scope: input.scope,
    ...(input.productId ? { productId: input.productId } : {}),
    ...(input.expiresDays ? { expiresDays: input.expiresDays } : {}),
    reason: input.reason,
  });
}

export async function postRevoke(actorDiscordId: string, id: string): Promise<LakesideOutcome<{ ok: boolean; grant: LakesideGrant }>> {
  const res = await call<{ ok: boolean; grant: LakesideGrant }>("POST", "grants/revoke", {}, { actorDiscordId, grantId: id });
  if (!res.ok && res.kind === "rejected") {
    return { ...res, message: "That grant is no longer active or was not found; nothing changed." };
  }
  return res;
}

export async function fetchGrants(actorDiscordId: string, targetDiscordId?: string): Promise<LakesideOutcome<GrantsListing>> {
  const query: Record<string, string> = targetDiscordId
    ? { type: "discord", id: targetDiscordId, actorDiscordId }
    : { actorDiscordId };
  const res = await call<Partial<GrantsListing>>("GET", "grants", query);
  if (!res.ok) return res;
  return {
    ok: true,
    data: {
      grants: Array.isArray(res.data?.grants) ? res.data.grants : [],
      words: Array.isArray(res.data?.words) ? res.data.words : [],
      access: res.data?.access,
      claimed: res.data?.claimed,
    },
  };
}
