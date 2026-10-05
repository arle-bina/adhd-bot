import { EventEmitter } from "events";
import type { Message } from "discord.js";
import { describe, expect, it } from "vitest";
import { askFooterText, deliverAskAnswer, type AskMessagePayload, type AskResponse } from "../src/utils/ask-runtime.js";

function fakeMessage(): Message {
  return {
    id: "m1",
    createMessageComponentCollector: () => new EventEmitter(),
    edit: async () => undefined,
  } as unknown as Message;
}

const base: AskResponse = { answer: "Divisions: 4,210 at the front.", model: "m" };

describe("answer delivery", () => {
  it("posts the answer and spills long answers into follow-ups", async () => {
    const log: AskMessagePayload[] = [];
    await deliverAskAnswer({
      scopeId: "s1", userId: "u1", username: "u", question: "q",
      sink: {
        first: async payload => { log.push(payload); return fakeMessage(); },
        more: async payload => { log.push(payload); },
      },
    }, { ...base, answer: `${"word ".repeat(600)}end` });
    expect(log.length).toBeGreaterThan(1);
    expect(log[0].embeds).toHaveLength(1);
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
