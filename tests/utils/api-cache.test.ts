import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cachedGet, ttlFor, _cacheTesting } from "../../src/utils/api-cache.js";

describe("ttlFor", () => {
  it("assigns per-endpoint TTLs", () => {
    expect(ttlFor("/api/game/turn/status")).toBe(15_000);
    expect(ttlFor("/api/discord-bot/leaderboard", { country: "US" })).toBe(60_000);
    expect(ttlFor("/api/discord-bot/autocomplete", { q: "a" })).toBe(60_000);
    expect(ttlFor("/api/discord-bot/corporation", { list: "true" })).toBe(120_000);
    expect(ttlFor("/api/discord-bot/corporation", { name: "x" })).toBe(60_000);
  });
  it("caps per-user lookups at 30s", () => {
    expect(ttlFor("/api/discord-bot/lookup", { discordId: "1" })).toBe(30_000);
    expect(ttlFor("/api/discord-bot/career", { discordId: "1" })).toBe(30_000);
    expect(ttlFor("/api/game/turn/status", { discordId: "1" })).toBe(15_000);
  });
  it("never caches denied or unknown endpoints", () => {
    for (const p of [
      "/api/discord-bot/sync-roles",
      "/api/discord-bot/password-resets",
      "/api/discord-bot/broadcast-dms",
      "/api/discord-bot/blackjack/balance",
      "/api/discord-bot/blackjack/fund",
      "/api/discord-bot/channel-config",
      "/api/discord-bot/tickets/pending",
      "/api/something/else",
    ]) expect(ttlFor(p, { discordId: "1" })).toBe(0);
  });
});

describe("cachedGet", () => {
  beforeEach(() => { _cacheTesting.clear(); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it("serves repeat calls from cache until TTL expires", async () => {
    const load = vi.fn(async () => ({ n: 1 }));
    await cachedGet(true, "/api/discord-bot/state", { id: "1" }, load);
    await cachedGet(true, "/api/discord-bot/state", { id: "1" }, load);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61_000);
    await cachedGet(true, "/api/discord-bot/state", { id: "1" }, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("dedups concurrent in-flight requests", async () => {
    let resolve!: (v: number) => void;
    const load = vi.fn(() => new Promise<number>((r) => { resolve = r; }));
    const a = cachedGet(true, "/api/discord-bot/news", undefined, load);
    const b = cachedGet(true, "/api/discord-bot/news", undefined, load);
    resolve(7);
    expect(await a).toBe(7);
    expect(await b).toBe(7);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");
    await expect(cachedGet(true, "/api/discord-bot/news", undefined, load)).rejects.toThrow("boom");
    await expect(cachedGet(true, "/api/discord-bot/news", undefined, load)).resolves.toBe("ok");
  });

  it("bypasses the cache for uncacheable endpoints", async () => {
    const load = vi.fn(async () => 1);
    await cachedGet(true, "/api/discord-bot/sync-roles", { discordId: "1" }, load);
    await cachedGet(true, "/api/discord-bot/sync-roles", { discordId: "1" }, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("separates authed and public keys and returns isolated copies", async () => {
    const load = vi.fn(async () => ({ list: [1] }));
    const a = await cachedGet(true, "/api/forex/rates", undefined, load);
    a.list.push(2);
    const b = await cachedGet(true, "/api/forex/rates", undefined, load);
    expect(b.list).toEqual([1]);
    await cachedGet(false, "/api/forex/rates", undefined, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("stays bounded", async () => {
    for (let i = 0; i < _cacheTesting.MAX_ENTRIES + 50; i++) {
      await cachedGet(true, "/api/discord-bot/state", { id: String(i) }, async () => i);
    }
    expect(_cacheTesting.size()).toBeLessThanOrEqual(_cacheTesting.MAX_ENTRIES);
  });
});
