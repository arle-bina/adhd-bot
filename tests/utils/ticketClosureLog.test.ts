import { describe, expect, it } from "vitest";
import { buildTicketClosureLogPayload } from "../../src/utils/ticketClosureLog.js";

describe("buildTicketClosureLogPayload", () => {
  it("includes an automated resolution in the ticket-log embed and transcript", () => {
    const payload = buildTicketClosureLogPayload({
      ticketNumber: 1335,
      category: "bug",
      userId: "reporter-1",
      createdAt: "2026-09-19T08:45:57.658Z",
      subject: "Private Company Shareholders Buy Out",
      description: "How do I buy out the minority holders?",
      closerId: "resolution-bot",
      resolutionMessage: "Use the private sale flow.",
      messages: [
        {
          createdAt: new Date("2026-09-19T08:45:57.658Z"),
          author: { displayName: "Reporter", id: "reporter-1" },
          content: "How do I buy out the minority holders?",
        },
      ],
    });

    expect(payload.embed.title).toBe("🎫 Ticket Closed — #1335");
    expect(payload.embed.fields).toEqual(
      expect.arrayContaining([
        { name: "Closed by", value: "<@resolution-bot>", inline: true },
        { name: "Resolution", value: "Use the private sale flow." },
      ]),
    );
    expect(payload.transcript).toContain("Resolution (to opener): Use the private sale flow.");
    expect(payload.attachmentName).toBe("ticket-1335.txt");
  });
});
