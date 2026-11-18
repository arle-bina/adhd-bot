import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/utils/api-base.js", () => ({ apiFetch: vi.fn(), apiFetchPublic: vi.fn(), apiPost: vi.fn() }));
import { apiFetch } from "../../src/utils/api-base.js";
import { getState } from "../../src/utils/api-politics.js";
import { getAutocomplete } from "../../src/utils/api-game.js";

describe("country-scoped region API", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([
    ["CA_ON", undefined, "CA", "CA_ON"],
    ["on", "ca", "CA", "ON"],
    ["CA", undefined, "US", "CA"],
    ["UK_ENG", undefined, "UK", "UK_ENG"],
  ])("routes %s with country %s", async (id, country, expectedCountry, expectedId) => {
    await getState(id, country);
    expect(apiFetch).toHaveBeenCalledWith(`/api/discord-bot/country/${expectedCountry}/region`, { id: expectedId });
  });
  it("passes the selected country to province autocomplete", async () => {
    await getAutocomplete({ type: "states", q: "on", country: "ca", limit: 25 });
    expect(apiFetch).toHaveBeenCalledWith("/api/discord-bot/autocomplete", { type: "states", q: "on", country: "CA", limit: "25" });
  });
});
