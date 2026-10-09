import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChannelType, PermissionFlagsBits } from "discord.js";

vi.mock("../../src/utils/ticketsApi.js", () => ({
  updateTicket: vi.fn(async (payload: { action: string }) =>
    payload.action === "close"
      ? {
          ok: true,
          channelUpdatePosted: false,
          resolutionDelivered: false,
          resolutionVersion: Date.parse("2026-09-22T10:00:00.000Z"),
        }
      : { ok: true },
  ),
  getTicketReceiptUrl: vi.fn(
    async () => "https://ops.example/receipt/test-ticket",
  ),
  createTicket: vi.fn(async () => undefined),
}));

vi.mock("../../src/utils/ticketStore.js", async (importActual) => {
  const actual =
    await importActual<typeof import("../../src/utils/ticketStore.js")>();
  return { ...actual, getTicketByChannel: vi.fn(), getTickets: vi.fn(), removeTicket: vi.fn() };
});

import {
  closeTicket,
  closeLegacyNamedTicketChannel,
  handleTicketCloseModalSubmit,
  mergeTickets,
  recordMissingTicketConversation,
  retryPendingTicketLifecycle,
  TICKET_CLOSE_MODAL_PREFIX,
} from "../../src/utils/tickets.js";
import * as ticketStore from "../../src/utils/ticketStore.js";
import * as ticketsApi from "../../src/utils/ticketsApi.js";

/** Minimal Discord-shaped fakes for the close path (opener closing their own ticket). */
function buildScene() {
  const channelId = "c1";
  const opener = {
    id: "u1",
    permissions: {
      has: vi.fn(
        (permission: bigint) =>
          permission === PermissionFlagsBits.Administrator,
      ),
    },
    user: { id: "u1", tag: "opener#0001" },
    send: vi.fn(async () => undefined),
    client: { users: { fetch: vi.fn() } },
  };
  opener.client.users.fetch.mockResolvedValue(opener);

  const permissionOverwrites = {
    cache: new Map(),
    edit: vi.fn(async () => undefined),
  };

  const channel: Record<string, unknown> = {
    id: channelId,
    name: "ticket-0042",
    isTextBased: () => true,
    type: ChannelType.GuildText,
    messages: {
      fetch: vi.fn(async () => ({
        size: 0,
        values: () => [],
        last: () => undefined,
      })),
    },
    send: vi.fn(async () => ({ id: "posted" })),
    delete: vi.fn(async () => undefined),
    setName: vi.fn(async (name: string) => {
      channel.name = name;
    }),
    permissionOverwrites,
  };

  const guild = {
    id: "g1",
    channels: {
      cache: {
        get: vi.fn((id: string) => (id === channelId ? channel : undefined)),
      },
    },
    members: { fetch: vi.fn(async () => opener) },
  };
  channel.guild = guild;

  const interaction = {
    guild,
    channelId,
    customId: `${TICKET_CLOSE_MODAL_PREFIX}${channelId}`,
    user: opener.user,
    member: { id: "u1" }, // not a GuildMember instance → handler fetches via members.fetch
    fields: { getTextInputValue: vi.fn(() => "") },
    replied: false,
    deferred: false,
    reply: vi.fn(async () => undefined),
    deferReply: vi.fn(async () => undefined),
    editReply: vi.fn(async () => undefined),
    followUp: vi.fn(async () => undefined),
  };

  const ticket = {
    userId: "u1",
    category: "bug" as const,
    channelId,
    createdAt: new Date().toISOString(),
    ticketNumber: 42,
  };

  return { interaction, channel, guild, ticket, opener, permissionOverwrites };
}

describe("handleTicketCloseModalSubmit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the outcome, deletes the channel, and DMs the final outcome", async () => {
    const { interaction, channel, ticket, opener, permissionOverwrites } =
      buildScene();
    vi.mocked(ticketStore.getTicketByChannel).mockReturnValue(ticket as never);

    await handleTicketCloseModalSubmit(interaction as never);

    // The backend receives the shape accepted by the game API...
    expect(ticketsApi.updateTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "close",
        resolution: "The ticket was closed by the reporter.",
      }),
    );
    expect(ticketsApi.updateTicket).toHaveBeenCalledWith(
      expect.objectContaining({ action: "resolution-channel-delivered" }),
    );
    expect(ticketsApi.updateTicket).toHaveBeenCalledWith(
      expect.objectContaining({ action: "resolution-dm-delivered" }),
    );
    expect(channel.delete).toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(
          "https://ops.example/receipt/test-ticket",
        ),
        nonce: `tr-42-${Date.parse("2026-09-22T10:00:00.000Z").toString(36)}`,
        enforceNonce: true,
      }),
    );
    expect(permissionOverwrites.edit).not.toHaveBeenCalled();
    expect(channel.setName).not.toHaveBeenCalled();
    expect(opener.send).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              description: expect.stringContaining(
                "https://ops.example/receipt/test-ticket",
              ),
            }),
          }),
        ],
        nonce: `td-42-${Date.parse("2026-09-22T10:00:00.000Z").toString(36)}`,
        enforceNonce: true,
      }),
    );
    expect(ticketStore.removeTicket).toHaveBeenCalledWith("g1", "c1");

    // The staff-facing reply confirms both channels of delivery and actual closure.
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Ticket closed. The opener was sent the final outcome via DM.",
    });
    const replies = vi.mocked(interaction.editReply).mock.calls.flat();
    for (const call of replies) {
      expect(JSON.stringify(call)).not.toContain("Something went wrong");
    }
  });

  it("closes the channel even when the receipt service cannot return a link", async () => {
    const { interaction, channel, ticket, opener } = buildScene();
    vi.mocked(ticketStore.getTicketByChannel).mockReturnValue(ticket as never);
    vi.mocked(ticketsApi.getTicketReceiptUrl).mockResolvedValueOnce(undefined);

    await handleTicketCloseModalSubmit(interaction as never);

    expect(ticketsApi.updateTicket).toHaveBeenCalledWith(
      expect.objectContaining({ action: "close" }),
    );
    expect(channel.send).toHaveBeenCalled();
    expect(opener.send).toHaveBeenCalled();
    expect(channel.delete).toHaveBeenCalled();
    expect(ticketStore.removeTicket).toHaveBeenCalledWith("g1", "c1");
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Ticket closed. The opener was sent the final outcome via DM.",
    });
  });

  it("lets staff finish closing a legacy renamed channel with no ticket record", async () => {
    const { interaction, channel, opener } = buildScene();
    channel.name = "closed-ticket-mechanics-1343";
    vi.mocked(ticketStore.getTicketByChannel).mockReturnValue(undefined);

    await closeTicket(channel as never, opener as never, interaction as never);

    expect(channel.delete).toHaveBeenCalledWith(
      "Finish closing a legacy ticket channel",
    );
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Ticket channel closed.",
      ephemeral: true,
    });
  });

  it("closes the ticket and DMs the outcome when its channel post fails", async () => {
    const { interaction, channel, ticket, opener } = buildScene();
    vi.mocked(ticketStore.getTicketByChannel).mockReturnValue(ticket as never);
    vi.mocked(channel.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Discord unavailable"),
    );

    await handleTicketCloseModalSubmit(interaction as never);

    expect(ticketStore.removeTicket).toHaveBeenCalled();
    expect(channel.delete).toHaveBeenCalled();
    expect(opener.send).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Ticket closed. The opener was sent the final outcome via DM.",
    });
  });

  it("keeps an unsynced ticket open with a durable close retry intent", async () => {
    const { interaction, channel, ticket, opener } = buildScene();
    vi.mocked(ticketStore.getTicketByChannel).mockReturnValue(ticket as never);
    vi.mocked(ticketsApi.updateTicket).mockResolvedValueOnce(undefined);

    await handleTicketCloseModalSubmit(interaction as never);

    expect(channel.send).not.toHaveBeenCalled();
    expect(channel.setName).not.toHaveBeenCalled();
    expect(channel.delete).not.toHaveBeenCalled();
    expect(opener.send).not.toHaveBeenCalled();
    expect(ticketStore.removeTicket).not.toHaveBeenCalled();
    expect(ticket).toHaveProperty("pendingClose", expect.objectContaining({
      closerId: "u1",
      resolution: "The ticket was closed by the reporter.",
    }));
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "The close could not be saved to the support system, so the ticket remains open. I saved the retry request; please try again shortly.",
    });
  });

  it("does not delete a merge source when the backend close is unconfirmed", async () => {
    vi.mocked(ticketsApi.updateTicket).mockResolvedValueOnce(undefined);
    const sourceChannel = { id: "source", guild: { id: "g1" }, delete: vi.fn() };
    const targetChannel = { id: "target" };
    const sourceTicket = { channelId: "source", ticketNumber: 41, userId: "u1" };
    const targetTicket = { channelId: "target", ticketNumber: 42, userId: "u2" };
    const staff = { id: "staff", user: { tag: "staff#1" } };

    const result = await mergeTickets(
      sourceChannel as never,
      targetChannel as never,
      sourceTicket as never,
      targetTicket as never,
      staff as never,
      "same issue",
    );

    expect(result.success).toBe(false);
    expect(sourceTicket).toHaveProperty("pendingMerge");
    expect(sourceChannel.delete).not.toHaveBeenCalled();
  });

  it("retains a missing-conversation flag and appends deterministic evidence", async () => {
    const { guild, ticket } = buildScene();
    vi.mocked(ticketStore.getTicketByChannel).mockReturnValue(ticket as never);
    const deletedChannel = { ...buildScene().channel, guild };

    await recordMissingTicketConversation(deletedChannel as never);

    expect(ticket).toHaveProperty("missingConversation");
    expect(ticketsApi.updateTicket).toHaveBeenCalledWith(expect.objectContaining({
      action: "append",
      ticketNumber: 42,
      discordChannelId: "c1",
      message: expect.objectContaining({
        discordMessageId: expect.stringMatching(/^channel-deleted-42-c1$/),
        content: expect.stringContaining("does not resolve the ticket"),
      }),
    }));
  });

  it("retries missing-conversation evidence with the original event ID", async () => {
    const ticket = {
      userId: "u1",
      category: "bug" as const,
      channelId: "c1",
      createdAt: new Date().toISOString(),
      ticketNumber: 42,
      missingConversation: {
        detectedAt: "2026-10-09T12:00:00.000Z",
        eventId: "channel-deleted-42-c1",
      },
    };
    vi.mocked(ticketStore.getTickets).mockReturnValue({ c1: ticket } as never);
    const guild = { id: "g1" };

    await retryPendingTicketLifecycle(guild as never);
    await retryPendingTicketLifecycle(guild as never);

    const appends = vi.mocked(ticketsApi.updateTicket).mock.calls
      .map(([payload]) => payload)
      .filter((payload) => payload.action === "append");
    expect(appends).toHaveLength(2);
    expect(appends[0]?.message?.discordMessageId).toBe("channel-deleted-42-c1");
    expect(appends[1]?.message?.discordMessageId).toBe("channel-deleted-42-c1");
  });

  it("does not post a second channel receipt when Ops already sent the final update", async () => {
    const { interaction, channel, ticket, opener } = buildScene();
    vi.mocked(ticketStore.getTicketByChannel).mockReturnValue(ticket as never);
    vi.mocked(ticketsApi.updateTicket).mockResolvedValueOnce({
      ok: true,
      alreadyClosed: false,
      channelUpdatePosted: true,
      resolutionDelivered: false,
    });

    await handleTicketCloseModalSubmit(interaction as never);

    expect(channel.send).not.toHaveBeenCalled();
    expect(opener.send).toHaveBeenCalledOnce();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Ticket closed. The opener was sent the final outcome via DM.",
    });
  });

  it("keeps delivery pending when the bot cannot delete the channel", async () => {
    const { interaction, channel, ticket, opener } = buildScene();
    vi.mocked(ticketStore.getTicketByChannel).mockReturnValue(ticket as never);
    vi.mocked(channel.delete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Missing Manage Channels"),
    );

    await handleTicketCloseModalSubmit(interaction as never);

    expect(channel.send).toHaveBeenCalled();
    expect(opener.send).not.toHaveBeenCalled();
    expect(ticketStore.removeTicket).not.toHaveBeenCalled();
    expect(ticketsApi.updateTicket).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "resolution-dm-delivered" }),
    );
    expect(interaction.editReply).toHaveBeenCalledWith({
      content:
        "The channel could not be closed. Please retry; the staff transcript records the outcome.",
    });
  });
});

describe("legacy renamed ticket cleanup", () => {
  it("archives the channel before deleting it", async () => {
    const { channel, guild } = buildScene();
    channel.name = "closed-ticket-mechanics-reporter-1343";
    const log = {
      type: ChannelType.GuildText,
      send: vi.fn(async () => undefined),
    };
    Object.assign(guild.channels, { fetch: vi.fn(async () => log) });

    expect(await closeLegacyNamedTicketChannel(channel as never)).toBe(true);
    expect(log.send).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [expect.objectContaining({ name: "ticket-1343-legacy.txt" })],
      }),
    );
    expect(channel.delete).toHaveBeenCalledWith("Ticket #1343 closed");
    expect(log.send.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(channel.delete as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    );
  });

  it("leaves the channel in place if its transcript cannot be archived", async () => {
    const { channel, guild } = buildScene();
    channel.name = "closed-ticket-mechanics-reporter-1343";
    Object.assign(guild.channels, {
      fetch: vi.fn(async () => ({
        type: ChannelType.GuildText,
        send: vi.fn(async () => {
          throw new Error("log unavailable");
        }),
      })),
    });

    await expect(
      closeLegacyNamedTicketChannel(channel as never),
    ).rejects.toThrow("log unavailable");
    expect(channel.delete).not.toHaveBeenCalled();
  });
});
