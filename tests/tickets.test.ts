import { describe, expect, it } from "vitest";
import { buildFilingQuestionsMessage } from "../src/utils/tickets.js";

describe("filing questions", () => {
  it("keeps the full context prompt, including platform, with clear confirmation wording", () => {
    const message = buildFilingQuestionsMessage([
      "Link your game account.",
      "Confirm the affected page.",
      "Confirm the corporation.",
      "Confirm platform and client version.",
      "This extra item is outside the prompt limit.",
    ]);

    expect(message).toContain("Please confirm these details so we can investigate:");
    expect(message).toContain("Confirm platform and client version.");
    expect(message).not.toContain("outside the prompt limit");
    expect(message).not.toContain("one more detail");
  });
});
