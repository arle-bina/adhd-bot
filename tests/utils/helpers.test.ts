import { describe, it, expect } from "vitest";
import { EmbedBuilder } from "discord.js";
import { hexToInt, errorMessage, safeEmbedUrl } from "../../src/utils/helpers.js";

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

  it("maps TypeError fetch failed to network error", () => {
    const err = new TypeError("fetch failed");
    expect(errorMessage(err)).toBe(
      "Could not reach the game server — connection refused or DNS failure. Try again shortly."
    );
  });

  it("handles a non-Error thrown value", () => {
    expect(errorMessage("oops")).toBe("Error: oops");
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
