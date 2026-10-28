import type { Message } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { _activeReplyWatches, consumeReplyWatch, replyIntent, startReplyWatch } from "../src/utils/ask-reply-watch.js";

function chat(content: string, authorId = "u1", channelId = "c1", bot = false) {
  return { content, channelId, author: { id: authorId, bot } } as unknown as Message;
}

afterEach(() => vi.useRealTimers());

describe("replyIntent", () => {
  it.each(["yes", "Yeah!", "sure", "do it", "file it please", "go ahead", "please", "y", "ok", "OK.", "<@123> yes"])("reads %s as yes", text => {
    expect(replyIntent(text)).toBe("yes");
  });
  it.each(["no", "nah", "cancel", "don't", "Don’t file it", "nevermind", "never mind", "no thanks"])("reads %s as no", text => {
    expect(replyIntent(text)).toBe("no");
  });
  it.each(["ok so how do unions work?", "yes but what about the senate and the house next turn", "maybe", "", "nothing"])("ignores %s", text => {
    expect(replyIntent(text)).toBeNull();
  });
});

describe("reply watch", () => {
  it("hands a yes from the same person in the same channel to the flow, once", async () => {
    const onReply = vi.fn();
    const onExpire = vi.fn();
    startReplyWatch({ userId: "u1", channelId: "c1", onReply, onExpire });
    expect(consumeReplyWatch(chat("yes", "u2"))).toBe(false);
    expect(consumeReplyWatch(chat("yes", "u1", "c2"))).toBe(false);
    expect(consumeReplyWatch(chat("yes", "u1", "c1", true))).toBe(false);
    expect(consumeReplyWatch(chat("what about taxes", "u1"))).toBe(false);
    expect(consumeReplyWatch(chat("yes"))).toBe(true);
    expect(consumeReplyWatch(chat("yes"))).toBe(false);
    await vi.waitFor(() => expect(onReply).toHaveBeenCalledWith("yes", expect.anything()));
    expect(onExpire).not.toHaveBeenCalled();
    expect(_activeReplyWatches()).toBe(0);
  });

  it("expires after the window and clears itself", async () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const watch = startReplyWatch({ userId: "u1", channelId: "c1", timeoutMs: 1000, onReply: vi.fn(), onExpire });
    vi.advanceTimersByTime(999);
    expect(watch.active).toBe(true);
    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(onExpire).toHaveBeenCalledWith("timeout"));
    expect(watch.active).toBe(false);
    expect(_activeReplyWatches()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps one watch per person: a new one supersedes the old", async () => {
    const first = vi.fn();
    startReplyWatch({ userId: "u1", channelId: "c1", onReply: vi.fn(), onExpire: first });
    const second = startReplyWatch({ userId: "u1", channelId: "c1", onReply: vi.fn(), onExpire: vi.fn() });
    await vi.waitFor(() => expect(first).toHaveBeenCalledWith("superseded"));
    expect(_activeReplyWatches()).toBe(1);
    second.end("button");
    expect(_activeReplyWatches()).toBe(0);
  });
});
