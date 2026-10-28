import { describe, expect, it } from "vitest";
import { AskProgressState, DiscordConversationTracker } from "../src/utils/ask-progress.js";

describe("AskProgressState", () => {
  it("turns tool calls into a compact live checklist", () => {
    const progress = new AskProgressState(4);
    progress.status("Searching code and docs…");
    progress.action("entity_search(Acme)");
    progress.action("corporation_rankings(US)");

    expect(progress.render()).toBe([
      "Working on it…",
      "✓ Searching code and docs",
      "✓ entity_search(Acme)",
      "• corporation_rankings(US)…",
    ].join("\n"));
  });

  it("keeps only the most recent work and strips unsafe Discord formatting", () => {
    const progress = new AskProgressState(2);
    progress.action("one");
    progress.action("two");
    progress.action("@everyone **three**");
    expect(progress.render()).not.toContain("✓ one");
    expect(progress.render()).not.toContain("@everyone");
    expect(progress.render()).not.toContain("**");
  });
});

describe("DiscordConversationTracker", () => {
  it("uses a sliding follow-up window without arbitrary clock-boundary splits", () => {
    const tracker = new DiscordConversationTracker(20 * 60_000);
    const now = Date.UTC(2026, 7, 30, 20, 0, 0);
    const first = tracker.idFor("123456789", "987654321", now);
    expect(tracker.idFor("123456789", "987654321", now + 19 * 60_000)).toBe(first);
    expect(tracker.idFor("123456789", "987654321", now + 38 * 60_000)).toBe(first);
    expect(tracker.idFor("123456789", "987654321", now + 59 * 60_000)).not.toBe(first);
    expect(first).toMatch(/^[A-Za-z0-9_-]{6,40}$/);
  });
});

describe("Ask Keir acknowledgement", () => {
  it("replaces the generic header and stays above the steps until the answer streams", () => {
    const progress = new AskProgressState();
    progress.ack("I'll look into how to build union support for you.");
    expect(progress.render()).toBe("I'll look into how to build union support for you.");
    progress.status("Searching docs");
    expect(progress.render().split("\n")[0]).toBe("I'll look into how to build union support for you.");
    progress.delta("Union support grows when");
    expect(progress.render()).toContain("Union support grows when");
  });

  it("strips mentions and formatting from the ack", () => {
    const progress = new AskProgressState();
    progress.ack("I'll look into @everyone **now** for you.");
    expect(progress.render()).not.toContain("@everyone");
    expect(progress.render()).not.toContain("**");
  });
});
