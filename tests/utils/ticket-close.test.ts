import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChannelType } from "discord.js";

// The backend mirror is best-effort. Force `updateTicket` to return undefined —
// the exact condition (unconfigured API, non-2xx, or an empty 2xx body) that
// used to make closing a ticket throw "Something went wrong". Closing must still
// succeed and delete the channel.
vi.mock("../../src/utils/ticketsApi.js", () => ({
  updateTicket: vi.fn(async () => undefined),
  getTicketReceiptUrl: vi.fn(async () => undefined),
  createTicket: vi.fn(async () => undefined),
}));

vi.mock("../../src/utils/ticketStore.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/utils/ticketStore.js")>();
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
    client: { users: { fetch: vi.fn() } },
  };

  const channel: Record<string, unknown> = {
    id: channelId,
    isTextBased: () => true,
    type: ChannelType.GuildText,
    messages: {
      fetch: vi.fn(async () => ({ size: 0, values: () => [], last: () => undefined })),
    },
    send: vi.fn(async () => ({ id: "posted" })),
    delete: vi.fn(async () => undefined),
  };

  const guild = {
    id: "g1",
    channels: { cache: { get: vi.fn((id: string) => (id === channelId ? channel : undefined)) } },
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

  return { interaction, channel, guild, ticket };
}

describe("handleTicketCloseModalSubmit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("closes the ticket even when the backend resolution persist does not confirm", async () => {
    const { interaction, channel, ticket } = buildScene();
    vi.mocked(ticketStore.getTicketByChannel).mockReturnValue(ticket as never);

    await handleTicketCloseModalSubmit(interaction as never);

    // Backend persist was attempted (best-effort)...
    expect(ticketsApi.updateTicket).toHaveBeenCalledWith(
      expect.objectContaining({ action: "close" }),
    );
    // ...but its undefined result did NOT block the close:
    expect(channel.delete).toHaveBeenCalled();
    expect(ticketStore.removeTicket).toHaveBeenCalledWith("g1", "c1");

    // The staff-facing reply is success, never the "something went wrong" regression.
    expect(interaction.editReply).toHaveBeenCalledWith({ content: "Ticket closed." });
    const replies = vi.mocked(interaction.editReply).mock.calls.flat();
    for (const call of replies) {
      expect(JSON.stringify(call)).not.toContain("Something went wrong");
    }
  });
});
