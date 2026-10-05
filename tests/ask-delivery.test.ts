import { EventEmitter } from "events";
import type { Message } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  PRIVATE_NOTICE,
  PRIVATE_UNAVAILABLE,
  askFooterText,
  deliverAskAnswer,
  type AskMessagePayload,
  type AskResponse,
  type AskSink,
} from "../src/utils/ask-runtime.js";

function fakeMessage(): Message {
  return {
    id: "m1",
    createMessageComponentCollector: () => new EventEmitter(),
    edit: async () => undefined,
  } as unknown as Message;
}

function recordingSink(log: AskMessagePayload[]): AskSink {
  return {
    first: async payload => { log.push(payload); return fakeMessage(); },
    more: async payload => { log.push(payload); },
  };
}

const base: AskResponse = { answer: "Divisions: 4,210 at the front.", model: "m" };

function target(publicLog: AskMessagePayload[], privateLog: AskMessagePayload[] | null) {
  return {
    scopeId: "s1", userId: "u1", username: "u", question: "q",
    sink: recordingSink(publicLog), isPrivate: false,
    privateSink: privateLog ? () => recordingSink(privateLog) : null,
  };
}

describe("staff-access answers", () => {
  it("go only to the asker, and the channel gets a notice without the content", async () => {
    const publicLog: AskMessagePayload[] = [];
    const privateLog: AskMessagePayload[] = [];
    await deliverAskAnswer(target(publicLog, privateLog), { ...base, moderator: true });
    expect(privateLog[0].content).toContain("4,210");
    expect(publicLog).toHaveLength(1);
    expect(publicLog[0].content).toBe(PRIVATE_NOTICE);
    expect(JSON.stringify(publicLog)).not.toContain("4,210");
  });

  it("are withheld entirely when no private route exists", async () => {
    const publicLog: AskMessagePayload[] = [];
    const delivered = await deliverAskAnswer(target(publicLog, null), { ...base, moderator: true });
    expect(delivered).toBeNull();
    expect(publicLog.map(p => p.content)).toEqual([PRIVATE_UNAVAILABLE]);
  });

  it("are withheld when private delivery fails (closed DMs)", async () => {
    const publicLog: AskMessagePayload[] = [];
    const failing = () => ({ first: async () => { throw new Error("Cannot send messages to this user"); }, more: async () => undefined });
    await deliverAskAnswer({ ...target(publicLog, null), privateSink: failing }, { ...base, moderator: true });
    expect(publicLog.map(p => p.content)).toEqual([PRIVATE_UNAVAILABLE]);
  });

  it("ordinary answers post publicly as before", async () => {
    const publicLog: AskMessagePayload[] = [];
    await deliverAskAnswer(target(publicLog, []), { ...base, moderator: false });
    expect(publicLog[0].content).toContain("4,210");
  });
});

describe("answer footer", () => {
  it("shows quota, the assumed character and a trimmed question", () => {
    const text = askFooterText(
      { ...base, usage: { remaining: 3, limit: 5 }, questionTrimmed: true, usedMcp: true },
      { requester: { discordUserId: "u", discordUsername: "u", characterId: "c", characterName: "Ada", country: null, corporationName: null, characterCount: 2 } },
    );
    expect(text).toContain("Live game data used");
    expect(text).toContain("3 of 5 questions left today");
    expect(text).toContain("Answered as Ada (1 of 2 characters");
    expect(text).toContain("trimmed to 500 characters");
  });

  it("ignores token usage objects from older engines", () => {
    expect(askFooterText({ ...base, usage: { input: 10, output: 20 } })).not.toContain("questions left");
  });
});
