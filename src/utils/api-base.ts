// Shared API infrastructure: error class, rate-limited fetch wrapper.

import { cachedGet, _cacheTesting } from "./api-cache.js";

export class ApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly responseBody: string;

  constructor(status: number, endpoint: string, responseBody: string) {
    const summary = responseBody.slice(0, 200) || "(empty response)";
    super(`API ${status} from ${endpoint}: ${summary}`);
    this.name = "ApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.responseBody = responseBody;
  }
}

/** An error event the Ask engine streamed; its message is written for players. */
export class AskServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AskServerError";
  }
}

async function throwApiError(response: Response, endpoint: string): Promise<never> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    body = "(could not read response body)";
  }
  throw new ApiError(response.status, endpoint, body);
}

// ---------------------------------------------------------------------------
// Concurrency-limited fetch — prevents flooding the game API
// ---------------------------------------------------------------------------

const MAX_CONCURRENT = 5;
export const FETCH_TIMEOUT_MS = 60_000;

let active = 0;
const waiting: Array<() => void> = [];

// Ask answers stream for minutes. They get their own pool so a handful of
// slow answers can never starve every other command of game API slots.
const ASK_MAX_CONCURRENT = Math.max(1, Number(process.env.ASK_MAX_CONCURRENT || 3));
let askActive = 0;
const askWaiting: Array<() => void> = [];

function acquireAsk(): Promise<void> {
  if (askActive < ASK_MAX_CONCURRENT) {
    askActive++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => askWaiting.push(resolve));
}

function releaseAsk(): void {
  const next = askWaiting.shift();
  if (next) next();
  else askActive = Math.max(0, askActive - 1);
}

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  if (active <= 0 && waiting.length === 0) return;
  active--;
  if (waiting.length > 0) {
    active++;
    const next = waiting.shift()!;
    next();
  }
}

/** Build the standard auth headers for bot API calls. */
function authHeaders(pathname = ""): Record<string, string> {
  // /api/public/v1 only accepts the game's PUBLIC_BOT_API_KEY, which is a
  // different credential from the private discord-bot key.
  if (pathname.startsWith("/api/public/v1/") && process.env.GAME_PUBLIC_API_KEY) {
    return { "X-Bot-Token": process.env.GAME_PUBLIC_API_KEY };
  }
  return { "X-Bot-Token": process.env.GAME_API_KEY! };
}

/** Rate-limited GET request to the game API. */
export function apiFetch<T>(pathname: string, params?: Record<string, string>): Promise<T> {
  return cachedGet(true, pathname, params, () => apiFetchUncached<T>(pathname, params));
}

async function apiFetchUncached<T>(pathname: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(pathname, process.env.GAME_API_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  await acquire();
  try {
    const response = await fetch(url.toString(), {
      headers: authHeaders(pathname),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) await throwApiError(response, pathname);
    return response.json() as Promise<T>;
  } finally {
    release();
  }
}

/** Rate-limited GET request to the ops dashboard's machine-only ticket API. */
export async function opsApiFetch<T>(pathname: string): Promise<T> {
  const configuredBaseUrl = process.env.OPS_DASHBOARD_URL;
  const baseUrl = configuredBaseUrl || "https://ops.lakesidegames.net";
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("Ops dashboard ticket link configuration is missing");
  }
  const canonicalBaseUrl = "https://ops.lakesidegames.net";
  const configuredUrl = new URL(pathname, baseUrl);
  const canonicalUrl = new URL(pathname, canonicalBaseUrl);

  const request = async (url: URL): Promise<Response> => {
    await acquire();
    try {
      return await fetch(url.toString(), {
        headers: { Authorization: `Bot ${token}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } finally {
      release();
    }
  };

  let response = await request(configuredUrl);
  const needsCanonicalRetry = [401, 403, 404].includes(response.status)
    && configuredUrl.origin !== canonicalUrl.origin;
  if (needsCanonicalRetry) {
    await response.body?.cancel().catch(() => {});
    response = await request(canonicalUrl);
  }
  if (!response.ok) await throwApiError(response, pathname);
  return response.json() as Promise<T>;
}

/** Rate-limited GET request without auth (public endpoints). */
export function apiFetchPublic<T>(pathname: string, params?: Record<string, string>): Promise<T> {
  return cachedGet(false, pathname, params, () => apiFetchPublicUncached<T>(pathname, params));
}

async function apiFetchPublicUncached<T>(pathname: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(pathname, process.env.GAME_API_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  await acquire();
  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) await throwApiError(response, pathname);
    return response.json() as Promise<T>;
  } finally {
    release();
  }
}

/** Rate-limited POST request to the game API. */
export async function apiPost<T>(pathname: string, body: unknown): Promise<T> {
  const url = new URL(pathname, process.env.GAME_API_URL);

  await acquire();
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) await throwApiError(response, pathname);
    return response.json() as Promise<T>;
  } finally {
    release();
  }
}

/** Rate-limited PATCH request to the game API. */
export async function apiPatch<T>(pathname: string, body: unknown): Promise<T> {
  const url = new URL(pathname, process.env.GAME_API_URL);

  await acquire();
  try {
    const response = await fetch(url.toString(), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) await throwApiError(response, pathname);
    return response.json() as Promise<T>;
  } finally {
    release();
  }
}

/** Rate-limited POST request without auth (public endpoints). */
export async function apiPostPublic<T>(pathname: string, body: unknown, baseUrl?: string, timeoutMs?: number): Promise<T> {
  const url = new URL(pathname, baseUrl || process.env.GAME_API_URL);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // ops-dash names this ASK_API_SECRET; accept either so a copy of the server's
  // own var name still authenticates instead of silently sending no header.
  const askSecret = process.env.ASK_SECRET || process.env.ASK_API_SECRET;
  if (askSecret) headers["X-Ask-Secret"] = askSecret;

  await acquire();
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs ?? FETCH_TIMEOUT_MS),
    });
    if (!response.ok) await throwApiError(response, pathname);
    return response.json() as Promise<T>;
  } finally {
    release();
  }
}

/** Authenticated request to the Ask site itself, used for bot answer feedback. */
export async function apiPostAskSite<T>(pathname: string, body: unknown, timeoutMs = 15_000): Promise<T> {
  const baseUrl = process.env.ASK_SITE_URL || "https://ask.lakesidegames.net";
  const secret = process.env.ASK_SECRET || process.env.ASK_API_SECRET;
  if (!secret) throw new Error("ASK_SECRET is required for Ask-site feedback");
  const url = new URL(pathname, baseUrl);
  await acquire();
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) await throwApiError(response, pathname);
    return response.json() as Promise<T>;
  } finally {
    release();
  }
}

export interface PublicStreamEvent {
  event: string;
  data: unknown;
}

async function postPublicStream<T>(
  pathname: string,
  body: unknown,
  onEvent: (event: PublicStreamEvent) => void | Promise<void>,
  baseUrl: string,
  headers: Record<string, string>,
  timeoutMs?: number,
  pool: { acquire: () => Promise<void>; release: () => void } = { acquire, release },
): Promise<T> {
  const url = new URL(pathname, baseUrl);

  await pool.acquire();
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs ?? FETCH_TIMEOUT_MS),
    });
    if (!response.ok) await throwApiError(response, pathname);
    if (!response.headers.get("content-type")?.includes("text/event-stream")) {
      return response.json() as Promise<T>;
    }
    if (!response.body) throw new Error("Ask stream ended without a response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: T | undefined;

    const consumeFrame = async (frame: string): Promise<void> => {
      let event = "message";
      const dataLines: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (!dataLines.length) return;
      const data = JSON.parse(dataLines.join("\n")) as unknown;
      if (event === "result" || event === "done") result = data as T;
      if (event === "error") {
        const message = typeof data === "object" && data && "error" in data
          ? String((data as { error: unknown }).error)
          : "Ask request failed";
        throw new AskServerError(message);
      }
      await onEvent({ event, data });
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) await consumeFrame(frame);
      if (done) break;
    }
    if (buffer.trim()) await consumeFrame(buffer);
    if (result === undefined) throw new Error("Ask stream ended before returning an answer");
    return result;
  } finally {
    pool.release();
  }
}

/** Public POST request that consumes SSE progress and returns its final result. */
export async function apiPostPublicStream<T>(
  pathname: string,
  body: unknown,
  onEvent: (event: PublicStreamEvent) => void | Promise<void>,
  baseUrl?: string,
  timeoutMs?: number,
): Promise<T> {
  const askSecret = process.env.ASK_SECRET || process.env.ASK_API_SECRET;
  return postPublicStream(pathname, body, onEvent, baseUrl || process.env.GAME_API_URL!,
    askSecret ? { "X-Ask-Secret": askSecret } : {}, timeoutMs);
}

/** Full Ask-site pipeline for Discord: bearer-authenticated and SSE streamed. */
export async function apiPostAskSiteStream<T>(
  pathname: string,
  body: unknown,
  onEvent: (event: PublicStreamEvent) => void | Promise<void>,
  timeoutMs?: number,
): Promise<T> {
  const secret = process.env.ASK_SECRET || process.env.ASK_API_SECRET;
  if (!secret) throw new Error("ASK_SECRET is required for Ask-site answers");
  return postPublicStream(pathname, body, onEvent,
    process.env.ASK_SITE_URL || "https://ask.lakesidegames.net",
    { Authorization: `Bearer ${secret}` }, timeoutMs, { acquire: acquireAsk, release: releaseAsk });
}

// Expose for testing only
export const _testing = {
  clearCache: _cacheTesting.clear,
  acquire, release, getActive: () => active, getWaitingCount: () => waiting.length,
  acquireAsk, releaseAsk, getAskActive: () => askActive, getAskWaitingCount: () => askWaiting.length,
};
