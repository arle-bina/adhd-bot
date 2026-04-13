// Shared API infrastructure: error class, rate-limited fetch wrapper.

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
const FETCH_TIMEOUT_MS = 10_000;

let active = 0;
const waiting: Array<() => void> = [];

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
function authHeaders(): Record<string, string> {
  return { "X-Bot-Token": process.env.GAME_API_KEY! };
}

/** Rate-limited GET request to the game API. */
export async function apiFetch<T>(pathname: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(pathname, process.env.GAME_API_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  await acquire();
  try {
    const response = await fetch(url.toString(), {
      headers: authHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) await throwApiError(response, pathname);
    return response.json() as Promise<T>;
  } finally {
    release();
  }
}

/** Rate-limited GET request without auth (public endpoints). */
export async function apiFetchPublic<T>(pathname: string, params?: Record<string, string>): Promise<T> {
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

// Expose for testing only
export const _testing = { acquire, release, getActive: () => active, getWaitingCount: () => waiting.length };
