import { describe, expect, it } from "vitest";
import { feedbackConfirmation, parseFeedbackButton } from "../../src/utils/keirFeedback.js";

// The ops box (lakeside-ops apps/agent/lib/operator/feedback.js) parses this line.
const OPS_RECORDED = /^Thanks, feedback recorded: (⭐|👍|👎|🚩) /u;

describe("Keir feedback", () => {
  it("parses only the four buttons", () => {
    expect(parseFeedbackButton("keir_fb:great")).toBe("great");
    expect(parseFeedbackButton("keir_fb:report")).toBe("report");
    expect(parseFeedbackButton("keir_fb:other")).toBeNull();
    expect(parseFeedbackButton("keir_decision:approve:abcdefabcdef")).toBeNull();
  });

  it("keeps the confirmation the ops box parses", () => {
    for (const vote of ["great", "up", "down", "report"] as const) expect(feedbackConfirmation(vote)).toMatch(OPS_RECORDED);
    expect(feedbackConfirmation("down", "  wrong\n tax rate ")).toBe("Thanks, feedback recorded: 👎 Not helpful.\nReason: wrong tax rate");
    expect(feedbackConfirmation("up", "")).toBe("Thanks, feedback recorded: 👍 Helpful.");
  });
});
