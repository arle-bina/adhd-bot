import { describe, expect, it } from "vitest";
import {
  beginTicketResolutionDelivery,
  endTicketResolutionDelivery,
  appendReceiptLink,
  resolutionDeliveryPlan,
} from "../../src/utils/ticketResolutionDelivery.js";

describe("resolution delivery plan", () => {
  it("sends a DM and closes the channel without reposting an Ops receipt", () => {
    expect(
      resolutionDeliveryPlan({
        discordChannelId: "channel-1",
        channelUpdatePosted: true,
        deliveredAt: null,
      }),
    ).toEqual({
      needsPlayerDelivery: true,
      needsChannelReceipt: false,
      needsChannelClose: true,
    });
  });

  it("posts a channel receipt, sends a DM, and closes when neither delivery is complete", () => {
    expect(
      resolutionDeliveryPlan({
        discordChannelId: "channel-1",
        deliveredAt: null,
      }),
    ).toEqual({
      needsPlayerDelivery: true,
      needsChannelReceipt: true,
      needsChannelClose: true,
    });
  });

  it("does not deliver again after the DM was recorded", () => {
    expect(
      resolutionDeliveryPlan({
        discordChannelId: "channel-1",
        deliveredAt: "2026-09-19T00:00:00.000Z",
      }),
    ).toEqual({
      needsPlayerDelivery: false,
      needsChannelReceipt: false,
      needsChannelClose: false,
    });
  });

  it("keeps legacy channel-less delivery as a DM only", () => {
    expect(resolutionDeliveryPlan({ deliveredAt: null })).toEqual({
      needsPlayerDelivery: true,
      needsChannelReceipt: false,
      needsChannelClose: false,
    });
  });
});

describe("appendReceiptLink", () => {
  it("keeps the complete receipt link at the end when the outcome is too long", () => {
    const url = "https://ops.example/receipt/test-ticket";
    const result = appendReceiptLink("x".repeat(200), url, 100);
    expect(result).toHaveLength(100);
    expect(result.endsWith(`**Support receipt:** ${url}`)).toBe(true);
  });
});

describe("ticket resolution delivery lock", () => {
  it("prevents overlapping sends for one ticket and releases for retries", () => {
    expect(beginTicketResolutionDelivery(84)).toBe(true);
    expect(beginTicketResolutionDelivery(84)).toBe(false);
    expect(beginTicketResolutionDelivery(85)).toBe(true);
    endTicketResolutionDelivery(84);
    expect(beginTicketResolutionDelivery(84)).toBe(true);
    endTicketResolutionDelivery(84);
    endTicketResolutionDelivery(85);
  });
});
