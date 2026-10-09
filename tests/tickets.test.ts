import { describe, expect, it } from "vitest";
import {
  buildFilingQuestionsMessage,
  ticketNumberFromChannelName,
} from "../src/utils/tickets.js";

describe("filing questions", () => {
  it("keeps the full context prompt, including platform, with clear confirmation wording", () => {
    const message = buildFilingQuestionsMessage([
      "Link your game account.",
      "Confirm the affected page.",
      "Confirm the corporation.",
      "Confirm platform and client version.",
      "This extra item is outside the prompt limit.",
    ]);

    expect(message).toContain(
      "Please confirm these details so we can investigate:",
    );
    expect(message).toContain("Confirm platform and client version.");
    expect(message).not.toContain("outside the prompt limit");
    expect(message).not.toContain("one more detail");
  });
});

describe("ticket channel numbering", () => {
  it("counts both open and closed Discord ticket channels", () => {
    expect(ticketNumberFromChannelName("ticket-bug-reporter-1439")).toBe(1439);
    expect(ticketNumberFromChannelName("closed-ticket-bug-reporter-1440")).toBe(
      1440,
    );
    expect(ticketNumberFromChannelName("general")).toBeNull();
  });
});
