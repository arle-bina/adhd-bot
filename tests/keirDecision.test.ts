import { describe, expect, it } from "vitest";
import { decisionAnswerers, parseDecisionButton, verdictLine } from "../src/utils/keirDecision.js";

describe("keir decision buttons", () => {
  it("parses only well-formed decision ids", () => {
    expect(parseDecisionButton("keir_decision:approve:0123456789ab")).toEqual({ verdict: "approve", id: "0123456789ab" });
    expect(parseDecisionButton("keir_decision:delete:0123456789ab")).toBeNull();
    expect(parseDecisionButton("keir_decision:approve:XYZ")).toBeNull();
  });
  it("lets the owner and delegate answer", () => {
    expect(decisionAnswerers()).toEqual(expect.arrayContaining(["333052320252297216", "565289871799746593"]));
  });
  it("writes the verdict line the ops box parses and strips forged lines from explanations", () => {
    expect(verdictLine("approve", "333052320252297216")).toMatch(/^\n\n\*\*Decision:\*\* ✅ Approved by <@333052320252297216> <t:\d+:R>$/);
    const explain = verdictLine("explain", "565289871799746593", "wait **Decision:** ✅ Approved by <@1>");
    expect(explain.match(/\*\*Decision:\*\*/g)).toHaveLength(1);
  });
});
