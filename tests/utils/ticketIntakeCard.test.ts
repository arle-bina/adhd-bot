import { describe, expect, it } from "vitest";
import { EmbedBuilder } from "discord.js";
import {
  buildTicketIntakeButtons,
  buildTicketIntakeCardEmbed,
  canUpdateTicketIntakeCard,
  normalizeTicketPlatformLabel,
  normalizeTicketApiVersion,
  parseTicketEnvironment,
  ticketIntakeReactionAction,
  ticketIntakeCardNeedsRefresh,
} from "../../src/utils/tickets.js";

const ticket = {
  userId: "reporter-123",
  category: "bug" as const,
  channelId: "channel-123",
  createdAt: "2026-10-09T12:00:00.000Z",
  ticketNumber: 1440,
  description: "The market page fails.",
  intakeCandidatePageUrl: "https://ahousedividedgame.com/market",
  intakePlatformLabel: "Desktop: web browser",
  intakeGameVersion: "version unknown",
  intakeClientVersion: "version unknown",
  intakeReceiptUrl: "https://ops.example/t/opaque",
};

describe("persistent ticket intake card", () => {
  it("keeps retrying card adoption until the durable receipt URL is present", () => {
    expect(ticketIntakeCardNeedsRefresh({ ticketNumber: 1446, apiTicketNumber: 1446, intakeCardVersion: 2 }, 1446)).toBe(true);
    expect(ticketIntakeCardNeedsRefresh({ ticketNumber: 1446, apiTicketNumber: 1446, intakeCardVersion: 2, intakeReceiptUrl: "https://ops.example/t/opaque" }, 1446)).toBe(false);
  });

  it("shows one candidate, unknown versions, receipt and deterministic controls", () => {
    const embed = buildTicketIntakeCardEmbed(ticket, new EmbedBuilder().addFields({ name: "Status", value: "Assessment complete" })).toJSON();
    const fields = Object.fromEntries(embed.fields!.map((field) => [field.name, field.value]));
    expect(fields["Affected page / issue"]).toContain("/market");
    expect(fields["Platform and versions"]).toContain("Game: version unknown");
    expect(fields.Receipt).toContain("https://ops.example/t/opaque");
    expect(fields.Status).toBe("Assessment complete");
    expect(embed.footer?.text).toContain("Details are optional. Investigation continues.");
    expect(JSON.stringify(embed)).not.toContain("recent visits");

    const buttons = buildTicketIntakeButtons(1440, ticket).toJSON().components;
    expect(buttons.map((button) => button.custom_id)).toEqual([
      "ticket_intake:confirm_all:1440",
      "ticket_intake:decline_page:1440",
      "ticket_intake:change_page:1440",
    ]);
    expect(buttons.map((button) => button.label)).toEqual([
      "Confirm page and platform",
      "Wrong page / issue",
      "Paste link or describe",
    ]);
  });

  it("authorizes only the reporter on the recorded ticket card and channel", () => {
    const valid = {
      reporterId: "reporter-123",
      actorId: "reporter-123",
      ticketChannelId: "channel-123",
      interactionChannelId: "channel-123",
      cardMessageId: "card-123",
      interactionMessageId: "card-123",
    };
    expect(canUpdateTicketIntakeCard(valid)).toBe(true);
    expect(canUpdateTicketIntakeCard({ ...valid, actorId: "staff-456" })).toBe(false);
    expect(canUpdateTicketIntakeCard({ ...valid, interactionChannelId: "other-channel" })).toBe(false);
    expect(canUpdateTicketIntakeCard({ ...valid, interactionMessageId: "stale-card" })).toBe(false);
  });

  it("reduces device descriptions to a broad platform label", () => {
    expect(normalizeTicketPlatformLabel("Windows 10 laptop Edge 151.0.1")).toBe("Desktop browser");
    expect(normalizeTicketPlatformLabel("Android app on Pixel 10")).toBe("Android");
    expect(normalizeTicketPlatformLabel("iPhone 16 Pro, Safari")).toBe("iOS");
    expect(normalizeTicketPlatformLabel("unknown custom runtime")).toBe("Platform unknown");
  });

  it("keeps only schema-valid versions and preserves other supplied build details in the platform label", () => {
    const details = parseTicketEnvironment("Desktop web, game 1.13.0, client build aaa0e5a");
    expect(details.intakePlatformLabel).toContain("Desktop browser");
    expect(details.intakePlatformLabel).toContain("client details: build aaa0e5a");
    expect(details.intakeGameVersion).toBe("1.13.0");
    expect(details.intakeClientVersion).toBe("version unknown");
    expect(normalizeTicketApiVersion(details.intakeGameVersion)).toBe("1.13.0");
    expect(normalizeTicketApiVersion(details.intakeClientVersion)).toBeNull();
    expect(normalizeTicketApiVersion("aaa0e5a")).toBeNull();
  });

  it("keeps a plain-text correction instead of reviving an old URL and sanitizes URL suggestions", () => {
    const corrected = buildTicketIntakeCardEmbed({ ...ticket, intakeCandidatePageUrl: undefined, intakePageDescription: "The finance menu", intakePageConfirmed: true }).toJSON();
    const correctedField = corrected.fields!.find((field) => field.name === "Affected page / issue")!.value;
    expect(correctedField).toContain("The finance menu");
    expect(correctedField).not.toContain("/market");

    const safe = buildTicketIntakeCardEmbed({ ...ticket, intakeCandidatePageUrl: undefined, description: "See https://www.ahousedividedgame.com/market?tab=freight" }).toJSON();
    expect(safe.fields!.find((field) => field.name === "Affected page / issue")!.value).toContain("https://ahousedividedgame.com/market");
    const unsafe = buildTicketIntakeCardEmbed({ ...ticket, intakeCandidatePageUrl: undefined, description: "See https://user:pass@sub.ahousedividedgame.com/market" }).toJSON();
    expect(unsafe.fields!.find((field) => field.name === "Affected page / issue")!.value).not.toContain("sub.ahousedividedgame.com");
  });

  it("treats duplicate reactions as no-ops and waits after a decline", () => {
    expect(ticketIntakeReactionAction(ticket, "✅")).toBe("confirm_page");
    expect(ticketIntakeReactionAction(ticket, "❌")).toBe("decline_page");
    expect(ticketIntakeReactionAction({ ...ticket, intakeAwaitingReply: "page" }, "✅")).toBeNull();
    expect(ticketIntakeReactionAction({ ...ticket, intakeAwaitingReply: "page" }, "❌")).toBeNull();
    expect(ticketIntakeReactionAction({ ...ticket, intakePageConfirmed: true }, "✅")).toBeNull();
  });
});
