import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const getAutocomplete = vi.fn();
vi.mock("../../src/utils/api.js", () => ({ getAutocomplete }));

const { fetchLiveCountries, validateCountry, __resetCountryCache } = await import(
  "../../src/utils/countryChoices.js"
);

beforeEach(() => {
  __resetCountryCache();
  getAutocomplete.mockReset();
  getAutocomplete.mockResolvedValue({
    results: [
      { id: "US", name: "United States" },
      { id: "RU", name: "Soviet Union" },
    ],
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchLiveCountries", () => {
  it("returns the enabled countries from the API", async () => {
    const r = await fetchLiveCountries("");
    expect(r.map((c) => c.id)).toEqual(["US", "RU"]);
  });

  it("serves a second call from cache without re-hitting the API", async () => {
    await fetchLiveCountries("");
    await fetchLiveCountries("");
    expect(getAutocomplete).toHaveBeenCalledTimes(1);
  });

  it("refetches once the cache TTL has elapsed", async () => {
    await fetchLiveCountries("");
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await fetchLiveCountries("");
    expect(getAutocomplete).toHaveBeenCalledTimes(2);
  });

  it("filters the cached list by the typed prefix", async () => {
    expect((await fetchLiveCountries("sov")).map((c) => c.id)).toEqual(["RU"]);
    expect((await fetchLiveCountries("ru")).map((c) => c.id)).toEqual(["RU"]);
  });

  it("returns an empty list when the API fails", async () => {
    getAutocomplete.mockRejectedValue(new Error("boom"));
    expect(await fetchLiveCountries("")).toEqual([]);
  });

  it("does not cache a failed lookup", async () => {
    getAutocomplete.mockRejectedValue(new Error("boom"));
    await fetchLiveCountries("");
    getAutocomplete.mockResolvedValue({ results: [{ id: "DD", name: "East Germany" }] });
    expect((await fetchLiveCountries("")).map((c) => c.id)).toEqual(["DD"]);
  });
});

describe("validateCountry", () => {
  it("accepts a null code (option omitted)", async () => {
    expect(await validateCountry(null)).toEqual({ ok: true });
  });

  it("accepts an enabled country", async () => {
    expect(await validateCountry("RU")).toEqual({ ok: true });
  });

  it("rejects a country that is not part of this game", async () => {
    const r = await validateCountry("ZZ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("not part of this game");
  });

  it("accepts any code when the availability lookup fails, rather than blocking the command", async () => {
    getAutocomplete.mockRejectedValue(new Error("boom"));
    expect(await validateCountry("ZZ")).toEqual({ ok: true });
  });
});
