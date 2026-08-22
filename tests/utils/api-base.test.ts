import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { _testing, ApiError, apiPostPublicStream } from "../../src/utils/api-base.js";

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
});
