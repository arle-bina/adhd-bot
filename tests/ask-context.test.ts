import { describe, expect, it, vi } from "vitest";
import { resolveAskIdentity } from "../src/utils/ask-context.js";

describe("resolveAskIdentity", () => {
  it("resolves a linked Discord user into exact live-data context", async () => {
    const lookup = vi.fn().mockResolvedValue({
      found: true,
      characters: [{
        id: "character-123",
        name: "Ada Player",
        countryId: "DD",
        ceoOf: "Public Works",
      }],
    });

    await expect(resolveAskIdentity(
      { id: "discord-456", username: "ada" },
      lookup,
    )).resolves.toEqual({
      discordUserId: "discord-456",
      discordUsername: "ada",
      characterId: "character-123",
      characterName: "Ada Player",
      country: "DD",
      corporationName: "Public Works",
    });
  });

  it("returns no identity when the user is unlinked", async () => {
    const lookup = vi.fn().mockResolvedValue({ found: false, characters: [] });

    await expect(resolveAskIdentity(
      { id: "discord-456", username: "ada" },
      lookup,
    )).resolves.toBeUndefined();
  });

  it("degrades gracefully when account lookup is unavailable", async () => {
    const lookup = vi.fn().mockRejectedValue(new Error("lookup unavailable"));

    await expect(resolveAskIdentity(
      { id: "discord-456", username: "ada" },
      lookup,
    )).resolves.toBeUndefined();
  });
});
