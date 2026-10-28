import { EventEmitter } from "events";
import type { ActionRowBuilder, ButtonBuilder, Message, MessageComponentInteraction, User } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postAsk = vi.fn();
vi.mock("../src/utils/api-base.js", async importOriginal => ({
  ...(await importOriginal<typeof import("../src/utils/api-base.js")>()),
  apiPostAskSite: (...args: unknown[]) => postAsk(...args),
}));

const { ApiError } = await import("../src/utils/api-base.js");
const { presentAskAction, confirmAskAction } = await import("../src/utils/ask-actions.js");
const { _activeReplyWatches, consumeReplyWatch } = await import("../src/utils/ask-reply-watch.js");

class FakeCollector extends EventEmitter {
  stopped = false;
  stop(reason = "user") {
    if (this.stopped) return;
    this.stopped = true;
    this.emit("end", new Map(), reason);
  }
}

function fakeCard() {
  const collector = new FakeCollector();
  const edits: Array<Record<string, unknown>> = [];
  const card = {
    createMessageComponentCollector: () => collector,
    edit: async (payload: Record<string, unknown>) => { edits.push(payload); return card; },
  } as unknown as Message;
  return { card, collector, edits };
}

function chat(content: string) {
  const replies: string[] = [];
  const message = {
    content, channelId: "c1", author: { id: "u1", bot: false },
    reply: async (payload: { content: string }) => { replies.push(payload.content); },
  } as unknown as Message;
  return { message, replies };
}

function fakeButton(customId: string, userId = "u1") {
  const calls: string[] = [];
  const button = {
    customId, user: { id: userId },
    reply: async () => { calls.push("reply"); },
    deferUpdate: async () => { calls.push("deferUpdate"); },
    editReply: async () => { calls.push("editReply"); },
  } as unknown as MessageComponentInteraction;
  return { button, calls };
}

const action = { id: "act_1234567890abcdef", kind: "suggestion" as const, title: "Union support meter", description: "Show it.", category: "ui_improvement" };

function context(card: Message, overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "u1" } as User,
    channelId: "c1",
    isPrivate: false,
    scopeId: "s1",
    post: vi.fn(async () => card),
    runOfferFromButton: vi.fn(async () => undefined),
    runOfferFromMessage: vi.fn(async () => undefined),
    ...overrides,
  };
}

function footer(payload: Record<string, unknown>): string {
  const embeds = payload.embeds as Array<{ toJSON(): { footer?: { text: string } } }>;
  return embeds[0].toJSON().footer?.text ?? "";
}

beforeEach(() => postAsk.mockReset());
afterEach(() => vi.useRealTimers());

describe("proposed action card", () => {
  it("files on a chat yes and shows the receipt", async () => {
    postAsk.mockResolvedValue({ ok: true, receipt: { kind: "suggestion", number: 123, url: "https://www.ahousedividedgame.com/feedback/123" } });
    const { card, collector, edits } = fakeCard();
    const ctx = context(card);
    await presentAskAction(ctx, { proposedAction: action });
    expect(ctx.post).toHaveBeenCalledOnce();
    expect(_activeReplyWatches()).toBe(1);

    const { message, replies } = chat("yes please");
    expect(consumeReplyWatch(message)).toBe(true);
    await vi.waitFor(() => expect(replies).toEqual(["Suggestion #123 filed."]));
    expect(postAsk).toHaveBeenCalledWith("/api/discord-ask/action/confirm", { actionId: action.id, discordId: "u1" }, 30_000);
    expect(footer(edits.at(-1)!)).toBe("Suggestion #123 filed.");
    expect(collector.stopped).toBe(true);
    expect(_activeReplyWatches()).toBe(0);
  });

  it("drops the draft at 3 minutes: buttons off, Not filed, cancel sent, nothing left running", async () => {
    vi.useFakeTimers();
    postAsk.mockResolvedValue({ ok: true });
    const { card, collector, edits } = fakeCard();
    await presentAskAction(context(card), { proposedAction: action });
    vi.advanceTimersByTime(3 * 60_000);
    await vi.waitFor(() => expect(postAsk).toHaveBeenCalledWith("/api/discord-ask/action/cancel", { actionId: action.id, discordId: "u1" }));
    expect(footer(edits.at(-1)!)).toBe("Not filed.");
    const row = (edits.at(-1)!.components as Array<ActionRowBuilder<ButtonBuilder>>)[0].toJSON();
    expect(row.components.every(c => (c as { disabled?: boolean }).disabled)).toBe(true);
    expect(collector.stopped).toBe(true);
    expect(_activeReplyWatches()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("files from the button, ignores other people, and ends the chat watch", async () => {
    postAsk.mockResolvedValue({ ok: true, receipt: { kind: "ticket", number: 456 } });
    const { card, collector } = fakeCard();
    await presentAskAction(context(card), { proposedAction: { ...action, kind: "ticket", category: "bug" } });

    const stranger = fakeButton("ask-act-file:s1", "u2");
    collector.emit("collect", stranger.button);
    await vi.waitFor(() => expect(stranger.calls).toEqual(["reply"]));
    expect(postAsk).not.toHaveBeenCalled();

    const mine = fakeButton("ask-act-file:s1");
    collector.emit("collect", mine.button);
    await vi.waitFor(() => expect(mine.calls).toEqual(["deferUpdate", "editReply"]));
    expect(postAsk).toHaveBeenCalledOnce();
    expect(_activeReplyWatches()).toBe(0);
    expect(consumeReplyWatch(chat("yes").message)).toBe(false);
  });

  it("cancels on a chat no", async () => {
    postAsk.mockResolvedValue({ ok: true });
    const { card } = fakeCard();
    await presentAskAction(context(card), { proposedAction: action });
    const { message, replies } = chat("nah");
    consumeReplyWatch(message);
    await vi.waitFor(() => expect(replies).toEqual(["Okay, not filed."]));
    expect(postAsk).toHaveBeenCalledWith("/api/discord-ask/action/cancel", expect.anything());
  });

  it("does not watch chat for private answers", async () => {
    const { card } = fakeCard();
    await presentAskAction(context(card, { isPrivate: true }), { proposedAction: action });
    expect(_activeReplyWatches()).toBe(0);
  });

  it("expires a private card through the interaction, since a plain edit cannot reach it", async () => {
    postAsk.mockResolvedValue({ ok: true });
    const { card, collector, edits } = fakeCard();
    const editCard = vi.fn(async () => undefined);
    await presentAskAction(context(card, { isPrivate: true, editCard }), { proposedAction: action });
    collector.stop("time");
    await vi.waitFor(() => expect(postAsk).toHaveBeenCalledWith("/api/discord-ask/action/cancel", { actionId: action.id, discordId: "u1" }));
    expect(editCard).toHaveBeenCalledOnce();
    expect(edits).toHaveLength(0);
  });
});

describe("confirmAskAction", () => {
  it("treats a 409 as already filed and returns the stored receipt", async () => {
    postAsk.mockRejectedValueOnce(new ApiError(409, "/x", JSON.stringify({ receipt: { kind: "suggestion", number: 7 } })));
    expect(await confirmAskAction("a", "u1")).toEqual({ ok: true, receipt: { kind: "suggestion", number: 7 } });
  });

  it("relays the engine's player-facing 4xx text and hides 5xx detail", async () => {
    postAsk.mockRejectedValueOnce(new ApiError(429, "/x", JSON.stringify({ error: "You can file 5 actions a day." })));
    expect(await confirmAskAction("a", "u1")).toEqual({ ok: false, message: "You can file 5 actions a day." });
    postAsk.mockRejectedValueOnce(new ApiError(500, "/x", "stack at foo.js:1"));
    const outcome = await confirmAskAction("a", "u1");
    expect(outcome.ok).toBe(false);
    expect(JSON.stringify(outcome)).not.toContain("foo.js");
  });
});

describe("offer", () => {
  it("runs the offer text through the normal flow on a chat yes", async () => {
    const { card } = fakeCard();
    const ctx = context(card);
    await presentAskAction(ctx, { offer: { kind: "suggestion", label: "File this as a suggestion" } });
    consumeReplyWatch(chat("sure").message);
    await vi.waitFor(() => expect(ctx.runOfferFromMessage).toHaveBeenCalledWith("File this as a suggestion", expect.anything()));
    expect(_activeReplyWatches()).toBe(0);
  });

  it("runs from the button and ends quietly on a no", async () => {
    const first = fakeCard();
    const ctx = context(first.card);
    await presentAskAction(ctx, { offer: { kind: "ticket" } });
    const { button } = fakeButton("ask-offer:s1");
    first.collector.emit("collect", button);
    await vi.waitFor(() => expect(ctx.runOfferFromButton).toHaveBeenCalledWith("Open a support ticket", button));

    const second = fakeCard();
    const ctx2 = context(second.card);
    await presentAskAction(ctx2, { offer: { kind: "ticket" } });
    consumeReplyWatch(chat("no").message);
    await vi.waitFor(() => expect(second.collector.stopped).toBe(true));
    expect(ctx2.runOfferFromMessage).not.toHaveBeenCalled();
    expect(_activeReplyWatches()).toBe(0);
  });

  it("prefers a drafted action over an offer and ignores malformed payloads", async () => {
    const { card } = fakeCard();
    const ctx = context(card);
    await presentAskAction(ctx, { proposedAction: { id: "", kind: "suggestion" }, offer: { kind: "nope" } });
    expect(ctx.post).not.toHaveBeenCalled();
  });
});
