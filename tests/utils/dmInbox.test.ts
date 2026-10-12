import { afterEach, describe, expect, it, vi } from "vitest";
import { dmInboxApiBase, reportDm, shouldReportDm } from "../../src/utils/dmInbox.js";

const base = { inGuild: false, authorIsBot: false, isWebhook: false };

describe("shouldReportDm", () => {
  it("reports human direct messages", () => {
    expect(shouldReportDm(base)).toBe(true);
  });

  it("ignores guild messages, bots and webhooks", () => {
    expect(shouldReportDm({ ...base, inGuild: true })).toBe(false);
    expect(shouldReportDm({ ...base, authorIsBot: true })).toBe(false);
    expect(shouldReportDm({ ...base, isWebhook: true })).toBe(false);
  });
});

describe("dmInboxApiBase", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("derives the inbox path from the ops dashboard url", () => {
    vi.stubEnv("DM_INBOX_API_URL", "");
    vi.stubEnv("OPS_DASHBOARD_URL", "https://ops.example.test");
    expect(dmInboxApiBase()).toBe("https://ops.example.test/api/keir/inbox");
  });

  it("honours an explicit override", () => {
    vi.stubEnv("DM_INBOX_API_URL", "http://127.0.0.1:9/inbox/");
    expect(dmInboxApiBase()).toBe("http://127.0.0.1:9/inbox");
  });
});

describe("reportDm", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends only the channel and message ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await reportDm("111", "222", [])).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/poke$/);
    expect(JSON.parse(init.body)).toEqual({ channelId: "111", messageId: "222" });
  });

  it("retries server errors and network failures", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await reportDm("1", "2", [0, 0])).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a rejected poke", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await reportDm("1", "2", [0, 0])).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
