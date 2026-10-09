import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tickets: {} as Record<string, Record<string, Record<string, unknown>>>,
  updateTicket: vi.fn(),
}));

vi.mock("../../src/utils/ticketStore.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/ticketStore.js")>();
  return {
    ...actual,
    addTicket: vi.fn((guildId: string, ticket: { channelId: string }) => {
      state.tickets[guildId] ??= {};
      state.tickets[guildId][ticket.channelId] = JSON.parse(JSON.stringify(ticket)) as Record<string, unknown>;
    }),
    getTickets: vi.fn((guildId: string) => state.tickets[guildId] ?? {}),
  };
});

vi.mock("../../src/utils/ticketsApi.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/ticketsApi.js")>();
  return { ...actual, updateTicket: state.updateTicket };
});

import { persistTicketIntakeInteraction, retryPendingTicketIntake } from "../../src/utils/tickets.js";
import type { Ticket } from "../../src/utils/ticketStore.js";

describe("ticket intake sync outbox", () => {
  beforeEach(() => {
    state.tickets = {};
    state.updateTicket.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it("retries failed actions in order using snapshotted versions and platform corrections", async () => {
    const ticket: Ticket = {
      userId: "reporter-1",
      category: "bug",
      channelId: "channel-1446",
      createdAt: "2026-10-09T12:00:00.000Z",
      ticketNumber: 1446,
      apiTicketNumber: 1446,
      intakePlatformLabel: "Desktop browser",
      intakeGameVersion: "1.13.0",
      intakeClientVersion: "version unknown",
    };
    state.updateTicket.mockResolvedValue(undefined);

    const firstAttempt = persistTicketIntakeInteraction("guild-1", ticket, "interaction-1", "decline_page");
    await vi.runAllTimersAsync();
    await expect(firstAttempt).resolves.toBe(false);

    const persisted = state.tickets["guild-1"]["channel-1446"] as Ticket;
    expect(persisted.pendingIntakeInteractions).toEqual([{
      interactionId: "interaction-1",
      reporterDiscordId: "reporter-1",
      action: "decline_page",
      gameVersion: "1.13.0",
      clientVersion: null,
    }]);
    expect(persisted.intakeInteractionIds).toBeUndefined();

    ticket.intakePlatformLabel = "Desktop browser Edge 151";
    ticket.intakeGameVersion = "1.14.0";
    ticket.intakeClientVersion = "2.3.4";
    const secondAttempt = persistTicketIntakeInteraction("guild-1", ticket, "interaction-2", "edit_details");
    await vi.runAllTimersAsync();
    await expect(secondAttempt).resolves.toBe(false);
    expect(state.updateTicket).toHaveBeenCalledTimes(6);
    expect(state.updateTicket.mock.calls.every(([payload]) => payload.interaction.interactionId === "interaction-1")).toBe(true);

    state.updateTicket.mockImplementation(async (payload) => ({
      ok: true,
      intake: {
        receiptUrl: "https://ops.lakesidegames.net/t/opaque",
        gameVersion: payload.intake.gameVersion,
        clientVersion: payload.intake.clientVersion,
        pageConfirmed: payload.interaction.action === "confirm_page",
      },
    }));
    await retryPendingTicketIntake("guild-1");

    const synced = state.tickets["guild-1"]["channel-1446"] as Ticket;
    expect(state.updateTicket.mock.calls.slice(-2).map(([payload]) => payload.interaction.interactionId))
      .toEqual(["interaction-1", "interaction-2"]);
    expect(state.updateTicket.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      ticketNumber: 1446,
      discordChannelId: "channel-1446",
      intake: { gameVersion: "1.14.0", clientVersion: "2.3.4" },
      interaction: expect.objectContaining({ interactionId: "interaction-2", action: "edit_details", value: "Desktop browser Edge 151" }),
    }));
    expect(synced.pendingIntakeInteractions).toEqual([]);
    expect(synced.intakeInteractionIds).toEqual(["interaction-1", "interaction-2"]);
    expect(synced.intakeReceiptUrl).toBe("https://ops.lakesidegames.net/t/opaque");
    expect(synced.intakeClientVersion).toBe("2.3.4");
  });
});
