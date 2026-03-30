import { describe, it, expect } from "vitest";
import { hexToInt, errorMessage } from "../../src/utils/helpers.js";

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
});
