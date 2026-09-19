import { describe, expect, it } from "vitest";
import { resolutionDeliveryPlan } from "../../src/utils/ticketResolutionDelivery.js";

describe("resolution delivery plan", () => {
  it("still attempts player delivery after a dashboard channel receipt", () => {
    expect(
      resolutionDeliveryPlan({
        discordChannelId: "channel-1",
        channelUpdatePosted: true,
        deliveredAt: null,
        channelClosedAt: null,
      }),
    ).toEqual({ needsPlayerDelivery: true, needsChannelClose: true });
  });

  it("retries channel closure after player delivery", () => {
    expect(
      resolutionDeliveryPlan({
        discordChannelId: "channel-1",
        deliveredAt: "2026-09-19T00:00:00.000Z",
        channelClosedAt: null,
      }),
    ).toEqual({ needsPlayerDelivery: false, needsChannelClose: true });
  });

  it("does not require a channel close when there is no channel", () => {
    expect(resolutionDeliveryPlan({ deliveredAt: null, channelClosedAt: null })).toEqual({
      needsPlayerDelivery: true,
      needsChannelClose: false,
    });
  });
});
