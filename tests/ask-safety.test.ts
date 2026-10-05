import { afterEach, describe, expect, it } from "vitest";
import { ApiError, AskServerError } from "../src/utils/api-base.js";
import { ASK_COOLDOWN_MS, ASK_MENTIONS, acquireAskSlot, askChannelAllowed, askErrorMessage } from "../src/utils/ask-safety.js";

describe("Ask safety", () => {
  afterEach(() => { delete process.env.ASK_CHANNEL_IDS; });

  it("never lets an answer ping anyone", () => {
    expect(ASK_MENTIONS).toEqual({ parse: [], repliedUser: false });
  });

  it("allows one Ask at a time per person, then a cooldown", () => {
    const first = acquireAskSlot("gate-user", 1_000_000);
    expect(first.ok).toBe(true);
    expect(acquireAskSlot("gate-user", 1_000_001).ok).toBe(false);
    if (first.ok) first.release();
    const cooling = acquireAskSlot("gate-user", 1_000_002);
    expect(cooling.ok).toBe(false);
    if (!cooling.ok) expect(cooling.message).toMatch(/Give it \d+s/);
    expect(acquireAskSlot("gate-user", 1_000_000 + ASK_COOLDOWN_MS + 1).ok).toBe(true);
  });

  it("gates channels only when an allowlist is configured, and never for staff", () => {
    expect(askChannelAllowed("123", false)).toBe(true);
    process.env.ASK_CHANNEL_IDS = "111, 222";
    expect(askChannelAllowed("222", false)).toBe(true);
    expect(askChannelAllowed("333", false)).toBe(false);
    expect(askChannelAllowed("333", true)).toBe(true);
  });

  it("relays engine-written messages but never raw upstream errors", () => {
    expect(askErrorMessage(new AskServerError("Every answer model is busy, try again in a moment."))).toContain("busy");
    const quota = new ApiError(429, "/api/discord-ask/answer", JSON.stringify({ error: "You've used all 5 questions for today.", quota: true }));
    expect(askErrorMessage(quota)).toBe("You've used all 5 questions for today.");
    const leak = new Error("fetch failed at https://internal.example:8080/x\n    at Socket.emit (node:events:517:28)");
    const generic = askErrorMessage(leak);
    expect(generic).not.toContain("internal.example");
    expect(generic).not.toContain("node:events");
    expect(askErrorMessage(new ApiError(502, "/x", "<html>Bad gateway</html>"))).not.toContain("html");
  });
});
