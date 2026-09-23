import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChannelType } from "discord.js";

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
  return { ...actual, getTicketByChannel: vi.fn(), removeTicket: vi.fn() };
});

import {
  handleTicketCloseModalSubmit,
  TICKET_CLOSE_MODAL_PREFIX,
} from "../../src/utils/tickets.js";
import * as ticketStore from "../../src/utils/ticketStore.js";
import * as ticketsApi from "../../src/utils/ticketsApi.js";

/** Minimal Discord-shaped fakes for the close path (opener closing their own ticket). */
function buildScene() {
  const channelId = "c1";
  const opener = {
    id: "u1",
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

  it("posts the channel receipt, locks the channel, and DMs the final outcome", async () => {
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
    expect(channel.delete).not.toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(
          "https://ops.example/receipt/test-ticket",
        ),
        nonce: `tr-42-${Date.parse("2026-09-22T10:00:00.000Z").toString(36)}`,
        enforceNonce: true,
      }),
    );
    expect(permissionOverwrites.edit).toHaveBeenCalledWith("u1", {
      SendMessages: false,
      AddReactions: false,
    });
    expect(channel.setName).toHaveBeenCalledWith(
      "closed-ticket-0042",
      "Ticket #42 closed",
    );
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
      content:
        "Ticket closed. The receipt remains visible in this channel, and the opener was sent a final DM.",
    });
    const replies = vi.mocked(interaction.editReply).mock.calls.flat();
    for (const call of replies) {
      expect(JSON.stringify(call)).not.toContain("Something went wrong");
    }
  });

  it("keeps the ticket available for retry when its channel receipt fails", async () => {
    const { interaction, channel, ticket } = buildScene();
    vi.mocked(ticketStore.getTicketByChannel).mockReturnValue(ticket as never);
    vi.mocked(channel.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Discord unavailable"),
    );

    await handleTicketCloseModalSubmit(interaction as never);

    expect(ticketStore.removeTicket).not.toHaveBeenCalled();
    expect(channel.delete).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content:
        "The ticket was saved as closed. The bot will retry the channel receipt and final DM.",
    });
  });

  it("leaves the channel open when the backend cannot update the ticket", async () => {
    const { interaction, channel, ticket, opener } = buildScene();
    vi.mocked(ticketStore.getTicketByChannel).mockReturnValue(ticket as never);
    vi.mocked(ticketsApi.updateTicket).mockResolvedValueOnce(undefined);

    await handleTicketCloseModalSubmit(interaction as never);

    expect(channel.send).not.toHaveBeenCalled();
    expect(channel.setName).not.toHaveBeenCalled();
    expect(opener.send).not.toHaveBeenCalled();
    expect(ticketStore.removeTicket).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content:
        "The ticket record could not be updated, so the channel was left open. Please retry shortly.",
    });
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
      content:
        "Ticket closed. The receipt remains visible in this channel, and the opener was sent a final DM.",
    });
  });

  it("keeps delivery pending when the bot cannot lock the channel", async () => {
    const { interaction, channel, ticket, opener, permissionOverwrites } =
      buildScene();
    vi.mocked(ticketStore.getTicketByChannel).mockReturnValue(ticket as never);
    vi.mocked(permissionOverwrites.edit).mockRejectedValueOnce(
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
        "The receipt is visible, but the channel could not be locked. Please retry closing it.",
    });
  });
});
