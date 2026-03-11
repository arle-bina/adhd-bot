import { describe, it, expect } from "vitest";
import { getMetricValue } from "../../src/commands/leaderboard.js";
import type { LeaderboardCharacter } from "../../src/utils/api.js";

const char: LeaderboardCharacter = {
  rank: 1,
  id: "test-id",
  name: "Test Politician",
  party: "Test Party",
  partyColor: "#ffffff",
  stateCode: "CA",
  position: "Senator",
  politicalInfluence: 1500,
  favorability: 75,
  profileUrl: "https://example.com",
};

describe("getMetricValue", () => {
  it("returns favorability when metric is favorability", () => {
    expect(getMetricValue(char, "favorability")).toBe(75);
  });

  it("returns politicalInfluence when metric is politicalInfluence", () => {
    expect(getMetricValue(char, "politicalInfluence")).toBe(1500);
  });
});
