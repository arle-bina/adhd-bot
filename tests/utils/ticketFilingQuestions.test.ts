import { describe, expect, it } from "vitest";
import { buildFilingQuestionsMessage } from "../../src/utils/tickets.js";

describe("buildFilingQuestionsMessage", () => {
  it("formats backend context questions as a visible follow-up", () => {
    const msg = buildFilingQuestionsMessage([
      "Please reply with the affected page's in-game link.",
    ]);
    expect(msg).toContain("We need one more detail");
    expect(msg).toContain("- Please reply with the affected page's in-game link.");
    expect(msg).toContain("Reply here with the missing link");
  });

  it("never carries the receipt link (the direct receipt post owns it)", () => {
    const msg = buildFilingQuestionsMessage(["Link your Discord account to the game."]);
    expect(msg).toContain("Link your Discord account");
    expect(msg).not.toContain("receipt");
  });

  it("caps at three questions and ignores blanks", () => {
    const msg = buildFilingQuestionsMessage(["  ", "q1", "q2", "q3", "q4"]);
    expect(msg).toContain("- q3");
    expect(msg).not.toContain("- q4");
  });

  it("returns null when there is nothing to ask", () => {
    expect(buildFilingQuestionsMessage(undefined)).toBeNull();
    expect(buildFilingQuestionsMessage([])).toBeNull();
    expect(buildFilingQuestionsMessage(["   "])).toBeNull();
  });
});
