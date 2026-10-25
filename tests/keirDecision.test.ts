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


it("records a named selection separately from permission", () => {
  expect(parseDecisionButton("keir_decision:choose3:0123456789ab")).toEqual({verdict:"choose3", id:"0123456789ab"});
  expect(parseDecisionButton("keir_decision:choose7:0123456789ab")).toBeNull();
  expect(verdictLine("choose3", "333052320252297216")).toMatch(/🔹 Selected 3 by <@333052320252297216>/);
  expect(verdictLine("choose3", "333052320252297216")).not.toMatch(/Approved|Rejected/);
});

// Drive the actual Discord handler with the exact message components Keir sent.
import { vi } from "vitest";
import type { ButtonInteraction } from "discord.js";
import { handleDecisionButton } from "../src/utils/keirDecision.js";
vi.mock("../src/utils/summon.js", () => ({ pokeSummon: vi.fn(async () => {}) }));
function click(customId = "keir_decision:choose2:0123456789ab", user = "333052320252297216") {
  const update = vi.fn(async () => {}), reply = vi.fn(async () => {});
  const value = {customId, user:{id:user}, client:{user:{id:"bot"}}, channelId:"dm", message:{id:"message", author:{id:"bot"}, content:"**Choose one**\nWhich policy?", components:[{components:[{customId:"keir_decision:choose2:0123456789ab"}]}]}, update, reply};
  return {interaction:value as unknown as ButtonInteraction, update, reply};
}
it("named choice click writes a selection receipt and removes the buttons", async () => {
  const f=click(); await handleDecisionButton(f.interaction);
  expect(f.update).toHaveBeenCalledWith({content:expect.stringMatching(/🔹 Selected 2 by <@333052320252297216>/),components:[]});
  expect(f.update.mock.calls[0]).not.toMatchObject({content:expect.stringContaining("Approved")});
});
it("a forged approval id cannot replace a choice button", async () => {
  const f=click("keir_decision:approve:0123456789ab"); await handleDecisionButton(f.interaction);
  expect(f.update).not.toHaveBeenCalled(); expect(f.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral:true}));
});
it("a stranger cannot choose an option", async () => {
  const f=click(undefined,"111111111111111111"); await handleDecisionButton(f.interaction);
  expect(f.update).not.toHaveBeenCalled(); expect(f.reply).toHaveBeenCalled();
});
