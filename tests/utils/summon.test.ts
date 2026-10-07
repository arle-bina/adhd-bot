import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FOOTER_PREFIX,
  buildSummonEmbed,
  buildSummonFailureEmbed,
  isSummonChannel,
  markSummonChannel,
  pokeSummon,
  shouldPoke,
  summonApiBase,
} from "../../src/utils/summon.js";

// The ops box parses the footer with this exact pattern; keep the two in step.
const OPS_FOOTER = /Despatch box · (start|stop|floor open|floor closed)$/;

const base = {
  channelActive: true,
  authorIsBot: false,
  isWebhook: false,
  isDeveloper: false,
  mentionsKeir: false,
  repliesToKeir: false,
};

describe("shouldPoke", () => {
  it("reports developer messages in a summoned channel", () => {
    expect(shouldPoke({ ...base, isDeveloper: true })).toBe(true);
  });

  it("reports players only when they address Keir", () => {
    expect(shouldPoke(base)).toBe(false);
    expect(shouldPoke({ ...base, mentionsKeir: true })).toBe(true);
    expect(shouldPoke({ ...base, repliesToKeir: true })).toBe(true);
  });

  it("ignores inactive channels, bots and webhooks", () => {
    expect(shouldPoke({ ...base, isDeveloper: true, channelActive: false })).toBe(false);
    expect(shouldPoke({ ...base, isDeveloper: true, authorIsBot: true })).toBe(false);
    expect(shouldPoke({ ...base, mentionsKeir: true, isWebhook: true })).toBe(false);
  });
});

describe("buildSummonEmbed", () => {
  it("carries the action in the footer the ops box parses", () => {
    for (const action of ["start", "stop", "floor open", "floor closed"] as const) {
      const footer = buildSummonEmbed(action, { userId: "1", task: "x" }).data.footer?.text;
      expect(footer).toBe(`${FOOTER_PREFIX}${action}`);
      expect(OPS_FOOTER.exec(footer ?? "")?.[1]).toBe(action);
    }
  });

  it("puts the task verbatim in the start description", () => {
    const task = "Add a /turn countdown\n- keep it short";
    const embed = buildSummonEmbed("start", { userId: "333", task });
    expect(embed.data.description).toBe(task);
    expect(embed.data.fields?.[0]?.value).toBe("<@333>");
  });

  it("drops the footer marker when a command is refused", () => {
    const footer = buildSummonFailureEmbed("nope").data.footer?.text ?? "";
    expect(OPS_FOOTER.test(footer)).toBe(false);
  });

  it("never uses em or en dashes in player-visible copy", () => {
    for (const action of ["start", "stop", "floor open", "floor closed"] as const) {
      const { title, description } = buildSummonEmbed(action, { userId: "1", task: "t" }).data;
      expect(`${title} ${description}`).not.toMatch(/[–—]/);
    }
  });
});

describe("summon API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUMMON_API_URL;
  });

  it("derives the endpoint from OPS_DASHBOARD_URL unless overridden", () => {
    const prev = process.env.OPS_DASHBOARD_URL;
    process.env.OPS_DASHBOARD_URL = "https://ops.example.test";
    expect(summonApiBase()).toBe("https://ops.example.test/api/summon");
    process.env.SUMMON_API_URL = "http://127.0.0.1:9763/api/summon/";
    expect(summonApiBase()).toBe("http://127.0.0.1:9763/api/summon");
    if (prev === undefined) delete process.env.OPS_DASHBOARD_URL;
    else process.env.OPS_DASHBOARD_URL = prev;
  });

  it("sends only ids and surfaces the box's verdict", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "not allowed" }), { status: 403 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await pokeSummon("1479993850205569034", "1479993850205569035");
    expect(result).toMatchObject({ ok: false, status: 403, error: "not allowed" });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ channelId: "1479993850205569034", messageId: "1479993850205569035" });
  });

  it("treats an unreachable box as a failed poke", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await pokeSummon("1", "2");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
  });

  it("tracks summoned channels", () => {
    markSummonChannel("42", true);
    expect(isSummonChannel("42")).toBe(true);
    markSummonChannel("42", false);
    expect(isSummonChannel("42")).toBe(false);
  });
});
