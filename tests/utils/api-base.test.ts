import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { _testing, ApiError, apiPostAskSiteStream, apiPostPublicStream, opsApiFetch } from "../../src/utils/api-base.js";

const { acquire, release, getActive, getWaitingCount } = _testing;

describe("ApiError", () => {
  it("captures status, endpoint, and response body", () => {
    const err = new ApiError(404, "/api/test", '{"error":"not found"}');
    expect(err.status).toBe(404);
    expect(err.endpoint).toBe("/api/test");
    expect(err.responseBody).toBe('{"error":"not found"}');
    expect(err.message).toContain("404");
    expect(err.message).toContain("/api/test");
  });

  it("truncates long response bodies in the message", () => {
    const longBody = "x".repeat(300);
    const err = new ApiError(500, "/api/test", longBody);
    expect(err.message.length).toBeLessThan(longBody.length + 50);
    expect(err.responseBody).toBe(longBody);
  });
});

describe("semaphore", () => {
  function drain() {
    // Drain both waiting and active to reset semaphore state
    while (getWaitingCount() > 0) release();
    while (getActive() > 0) release();
  }

  beforeEach(() => drain());
  afterEach(() => drain());

  it("allows up to 5 concurrent acquisitions", async () => {
    const handles: Array<Promise<void>> = [];
    for (let i = 0; i < 5; i++) {
      handles.push(acquire());
    }
    await Promise.all(handles);
    expect(getActive()).toBe(5);

    // 6th should queue
    let sixthResolved = false;
    const sixth = acquire().then(() => { sixthResolved = true; });
    // Give microtasks a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(sixthResolved).toBe(false);
    expect(getWaitingCount()).toBe(1);

    // Release one — sixth should proceed
    release();
    await sixth;
    expect(sixthResolved).toBe(true);
    expect(getActive()).toBe(5);

    // Clean up
    for (let i = 0; i < 5; i++) release();
    expect(getActive()).toBe(0);
  });

  it("does not go negative on spurious release", () => {
    release();
    release();
    expect(getActive()).toBe(0);
  });
});

describe("apiPostPublicStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports progress and returns the final SSE result", async () => {
    const fetchMock = vi.fn(async () => new Response(
      [
        'event: status\ndata: {"stage":"thinking"}',
        'event: status\ndata: {"stage":"live_data"}',
        'event: result\ndata: {"answer":"Turn 900"}',
        "",
      ].join("\n\n"),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const stages: string[] = [];

    const result = await apiPostPublicStream<{ answer: string }>(
      "/api/ask-public",
      { question: "What turn is it?" },
      ({ event, data }) => {
        if (event === "status") stages.push((data as { stage: string }).stage);
      },
      "https://ops.example.com",
    );

    expect(result).toEqual({ answer: "Turn 900" });
    expect(stages).toEqual(["thinking", "live_data"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ops.example.com/api/ask-public",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Accept: "text/event-stream" }),
      }),
    );
  });

  it("calls the Ask-site engine with bearer auth and accepts its done event", async () => {
    process.env.ASK_SITE_URL = "https://ask.example.com";
    process.env.ASK_SECRET = "shared-secret";
    const fetchMock = vi.fn(async () => new Response(
      [
        'event: status\ndata: {"label":"Searching code and docs…"}',
        'event: action\ndata: {"label":"corporation_rankings(US)"}',
        'event: done\ndata: {"answer":"Acme ranks first","answerId":77}',
        "",
      ].join("\n\n"),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiPostAskSiteStream<{ answer: string; answerId: number }>(
      "/api/discord-ask/answer",
      { question: "How is Acme doing?" },
      () => {},
    );

    expect(result).toEqual({ answer: "Acme ranks first", answerId: 77 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ask.example.com/api/discord-ask/answer",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer shared-secret" }),
      }),
    );
  });
});

describe("opsApiFetch ticket links", () => {
  const previousBase = process.env.OPS_DASHBOARD_URL;
  const previousToken = process.env.DISCORD_BOT_TOKEN;

  beforeEach(() => {
    process.env.DISCORD_BOT_TOKEN = "test-bot-token";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    if (previousBase === undefined) delete process.env.OPS_DASHBOARD_URL;
    else process.env.OPS_DASHBOARD_URL = previousBase;
    if (previousToken === undefined) delete process.env.DISCORD_BOT_TOKEN;
    else process.env.DISCORD_BOT_TOKEN = previousToken;
    vi.unstubAllGlobals();
  });

  it("uses the canonical dashboard when no origin is configured", async () => {
    delete process.env.OPS_DASHBOARD_URL;
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ receiptUrl: "https://ops.lakesidegames.net/t/opaque" }), { status: 200 }));

    await expect(opsApiFetch<{ receiptUrl: string }>("/api/tickets/1446/public-link"))
      .resolves.toEqual({ receiptUrl: "https://ops.lakesidegames.net/t/opaque" });
    expect(fetch).toHaveBeenCalledWith("https://ops.lakesidegames.net/api/tickets/1446/public-link", expect.objectContaining({
      headers: { Authorization: "Bot test-bot-token" },
    }));
  });

  it.each([401, 403, 404])( "falls back to the canonical dashboard after a stale-origin %s", async (status) => {
    process.env.OPS_DASHBOARD_URL = "http://127.0.0.1:9788";
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("not found", { status }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ receiptUrl: "https://ops.lakesidegames.net/t/opaque" }), { status: 200 }));

    await expect(opsApiFetch<{ receiptUrl: string }>("/api/tickets/1446/public-link"))
      .resolves.toEqual({ receiptUrl: "https://ops.lakesidegames.net/t/opaque" });
    expect(fetch).toHaveBeenNthCalledWith(2, "https://ops.lakesidegames.net/api/tickets/1446/public-link", expect.objectContaining({
      headers: { Authorization: "Bot test-bot-token" },
    }));
  });

  it("does not retry a transient server error against another origin", async () => {
    process.env.OPS_DASHBOARD_URL = "http://127.0.0.1:9788";
    vi.mocked(fetch).mockResolvedValueOnce(new Response("temporarily unavailable", { status: 503 }));

    await expect(opsApiFetch("/api/tickets/1446/public-link")).rejects.toThrow("API 503");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
