import { afterEach, describe, expect, it } from "vitest";
import { addTicket, getTicketByChannel, removeTicket } from "../../src/utils/ticketStore.js";

const guildId = `ticket-intake-restart-${process.pid}-${Date.now()}`;

afterEach(() => removeTicket(guildId, "ticket-channel"));

describe("ticket intake persistence", () => {
  it("rehydrates card identity, reporter state and interaction dedupe data from disk", () => {
    addTicket(guildId, {
      userId: "reporter-123",
      category: "bug",
      channelId: "ticket-channel",
      createdAt: "2026-10-09T12:00:00.000Z",
      ticketNumber: 1440,
      apiTicketNumber: 1440,
      intakeCardMessageId: "card-message-123",
      intakeCandidatePageUrl: "https://ahousedividedgame.com/market",
      intakeAwaitingReply: "page",
      intakeRevision: 4,
      intakeInteractionIds: ["interaction-1", "interaction-2"],
    });

    const recovered = getTicketByChannel(guildId, "ticket-channel");
    expect(recovered?.userId).toBe("reporter-123");
    expect(recovered?.intakeCardMessageId).toBe("card-message-123");
    expect(recovered?.intakeAwaitingReply).toBe("page");
    expect(recovered?.intakeRevision).toBe(4);
    expect(recovered?.intakeInteractionIds).toEqual(["interaction-1", "interaction-2"]);
  });
});
