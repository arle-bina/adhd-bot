import { describe, expect, it } from "vitest";
import { resolutionDeliveryPlan } from "../../src/utils/ticketResolutionDelivery.js";

describe("resolution delivery plan", () => {
  it("does not send a DM or close a channel after Ops posted its receipt", () => {
    expect(
      resolutionDeliveryPlan({
        discordChannelId: "channel-1",
        channelUpdatePosted: true,
        deliveredAt: null,
        channelClosedAt: null,
      }),
    ).toEqual({ needsPlayerDelivery: false, needsChannelClose: false });
  });

  it("keeps a delivered ticket channel visible", () => {
    expect(
      resolutionDeliveryPlan({
        discordChannelId: "channel-1",
        deliveredAt: "2026-09-19T00:00:00.000Z",
        channelClosedAt: null,
      }),
    ).toEqual({ needsPlayerDelivery: false, needsChannelClose: false });
  });

  it("does not require a channel close when there is no channel", () => {
    expect(resolutionDeliveryPlan({ deliveredAt: null, channelClosedAt: null })).toEqual({
      needsPlayerDelivery: true,
      needsChannelClose: false,
    });
  });
});
