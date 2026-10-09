import { describe, expect, it, vi } from "vitest";
import { sendTicketMessageWithRetry } from "../../src/utils/tickets.js";

describe("sendTicketMessageWithRetry", () => {
  it("retries an ambiguous send with the same nonce so Discord can deduplicate it", async () => {
    const send = vi
      .fn<(options: { content: string; nonce: string; enforceNonce: true }) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("connection reset after request"))
      .mockResolvedValueOnce({ id: "message-id" });
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      sendTicketMessageWithRetry(send, "receipt link", "t1439-receipt", wait),
    ).resolves.toBe(true);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toEqual({
      content: "receipt link",
      nonce: "t1439-receipt",
      enforceNonce: true,
    });
    expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("returns terminal failure after three attempts for staff alerting", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Discord unavailable"));
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      sendTicketMessageWithRetry(send, "filing questions", "t1439-questions", wait),
    ).resolves.toBe(false);

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.map(([options]) => options.nonce)).toEqual([
      "t1439-questions",
      "t1439-questions",
      "t1439-questions",
    ]);
    expect(wait).toHaveBeenCalledTimes(2);
  });
});
