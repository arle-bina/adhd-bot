import { describe, expect, it } from "vitest";
import { splitDiscordContent } from "../src/utils/discord-content.js";

describe("splitDiscordContent", () => {
  it("keeps short answers in one message", () => {
    expect(splitDiscordContent("Short answer")).toEqual(["Short answer"]);
  });

  it("splits long answers without exceeding Discord's limit", () => {
    const chunks = splitDiscordContent("paragraph words ".repeat(400));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 2000)).toBe(true);
    expect(chunks.some((chunk) => chunk.includes("*(truncated)*"))).toBe(false);
  });

  it("closes and reopens code fences across messages", () => {
    const chunks = splitDiscordContent(`Before\n\n\`\`\`ts\n${"const value = 1;\n".repeat(180)}\`\`\`\n\nAfter`, 500);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => (chunk.match(/```/g)?.length ?? 0) % 2 === 0)).toBe(true);
    expect(chunks.every((chunk) => chunk.length <= 500)).toBe(true);
  });
});
