import { vi, describe, it, expect } from "vitest";
import { EmbedBuilder } from "discord.js";
import { hexToInt, errorMessage, safeEmbedUrl, newErrorRef, replyWithError } from "../../src/utils/helpers.js";
import { FETCH_TIMEOUT_MS } from "../../src/utils/api-base.js";

/** Capture the real error discord.js throws when given an invalid embed URL. */
function captureInvalidUrlError(badUrl: string): unknown {
  try {
    new EmbedBuilder().setURL(badUrl);
    throw new Error("expected setURL to throw");
  } catch (e) {
    return e;
  }
}

describe("hexToInt", () => {
  it("converts hex string with # prefix to integer", () => {
    expect(hexToInt("#ffffff")).toBe(16777215);
  });

  it("converts hex string without # prefix to integer", () => {
    expect(hexToInt("ffffff")).toBe(16777215);
  });

  it("handles a non-white colour", () => {
    expect(hexToInt("#ff0000")).toBe(16711680);
  });
});

describe("errorMessage", () => {
  it("maps 401 error to bot configuration message", () => {
    expect(errorMessage(new Error("API error: 401"))).toBe(
      "Bot configuration error (401) — contact an admin."
    );
  });

  it("maps 400 error to invalid request message", () => {
    expect(errorMessage(new Error("API error: 400"))).toBe(
      "Invalid request (400) — check your inputs."
    );
  });

  it("maps other API errors to game API error message", () => {
    expect(errorMessage(new Error("API error: 500"))).toBe(
      "Game API error (500). Try again shortly."
    );
  });

  it("reports a TimeoutError with the configured timeout in seconds", () => {
    const err = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    });
    const msg = errorMessage(err);
    expect(msg).toContain(`${FETCH_TIMEOUT_MS / 1000}s timeout`);
    expect(msg).toContain("took too long");
  });

  it("maps TypeError fetch failed to network error", () => {
    const err = new TypeError("fetch failed");
    expect(errorMessage(err)).toBe(
      "Could not reach the game server — connection refused or DNS failure. Try again shortly."
    );
  });

  it("handles a non-Error thrown value", () => {
    expect(errorMessage("oops")).not.toContain("oops");
  });

  it("still reports a real network AggregateError as a connection failure", () => {
    const sub1 = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {
      code: "ECONNREFUSED",
    });
    const agg = Object.assign(new Error("Received one or more errors"), { errors: [sub1] });
    expect(errorMessage(agg)).toBe(
      "Could not reach the game server — connection refused. Try again shortly."
    );
  });

  it("does NOT mislabel a discord.js invalid-URL validation error as a connection failure", () => {
    const err = captureInvalidUrlError("/api/uploads/avatars/abc.webp");
    const msg = errorMessage(err);
    expect(msg).not.toContain("Could not reach the game server");
    expect(msg.toLowerCase()).toContain("url");
  });
});

describe("safeEmbedUrl", () => {
  it("returns absolute http(s) URLs unchanged", () => {
    expect(safeEmbedUrl("https://ahousedividedgame.com/x")).toBe(
      "https://ahousedividedgame.com/x"
    );
    expect(safeEmbedUrl("http://example.com/a.png")).toBe("http://example.com/a.png");
  });

  it("returns undefined for relative paths, bare filenames, and invalid values", () => {
    expect(safeEmbedUrl("/api/uploads/avatars/abc.webp")).toBeUndefined();
    expect(safeEmbedUrl("avatar.png")).toBeUndefined();
    expect(safeEmbedUrl("not a url")).toBeUndefined();
    expect(safeEmbedUrl(null)).toBeUndefined();
    expect(safeEmbedUrl(undefined)).toBeUndefined();
    expect(safeEmbedUrl("")).toBeUndefined();
  });

  it("produces a value that EmbedBuilder.setURL/​setThumbnail accept without throwing", () => {
    const ok = safeEmbedUrl("https://ahousedividedgame.com/character/1");
    expect(() => new EmbedBuilder().setURL(ok ?? null).setThumbnail(ok ?? null)).not.toThrow();
    const bad = safeEmbedUrl("/relative/only");
    expect(() => new EmbedBuilder().setURL(bad ?? null).setThumbnail(bad ?? null)).not.toThrow();
  });
});

describe("player-facing errors do not leak internals", () => {
  const body = '{"error":"MongoServerError secret stack at /srv/app/x.js"}';
  it("errorMessage hides endpoint and body for ApiError", async () => {
    const { ApiError } = await import("../../src/utils/api-base.js");
    for (const status of [400, 401, 403, 404, 429, 500, 418]) {
      const msg = errorMessage(new ApiError(status, "/api/discord-bot/secret-path", body));
      expect(msg).not.toContain("/api/");
      expect(msg).not.toContain("Mongo");
    }
  });

  it("errorMessage hides raw messages of unknown errors", () => {
    expect(errorMessage(new RangeError("boom at /root/x.ts"))).not.toContain("boom");
  });

  it("newErrorRef is a short hex id", () => {
    expect(newErrorRef()).toMatch(/^[0-9A-F]{6}$/);
  });

  it("replyWithError sends one embed with a ref, no stack, no endpoint", async () => {
    const { ApiError } = await import("../../src/utils/api-base.js");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const editReply = vi.fn(async () => undefined);
    await replyWithError({ editReply } as never, "state", new ApiError(500, "/api/discord-bot/state", body));
    const arg = (editReply.mock.calls[0] as unknown as [{ embeds: Array<{ toJSON(): { description: string; footer: { text: string }; fields?: unknown[] } }> }])[0];
    const json = arg.embeds[0].toJSON();
    const flat = JSON.stringify(json);
    expect(flat).not.toContain("/api/");
    expect(flat).not.toContain("Mongo");
    expect(flat).not.toContain("    at ");
    expect(json.footer.text).toMatch(/^Ref [0-9A-F]{6} · /);
    expect(json.fields ?? []).toHaveLength(0);
    const logged = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("/api/discord-bot/state");
    spy.mockRestore();
  });
});
