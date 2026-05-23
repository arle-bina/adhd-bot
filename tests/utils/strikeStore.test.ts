import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// The store writes to `<__dirname>/../../data/strikes.json`. From the compiled
// location `src/utils/strikeStore.ts`, that resolves to the repo's `data/`
// directory. We can't easily redirect the path without changing source, so we
// stage a temp data dir and chdir into it for each test, then point the module
// at a fresh import via vi.resetModules so its cached path resolves anew.

let workdir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  workdir = mkdtempSync(join(tmpdir(), "strikes-test-"));
  vi.resetModules();
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workdir, { recursive: true, force: true });
});

async function loadStore() {
  // The store resolves its data file relative to its own source location, so
  // chdir doesn't redirect it. Instead, we override the data file by writing
  // directly to the real path and reset it between tests.
  const mod = await import("../../src/utils/strikeStore.js");
  return mod;
}

const REAL_DATA_PATH = join(process.cwd(), "data", "strikes.json");

function cleanRealFile() {
  if (existsSync(REAL_DATA_PATH)) {
    writeFileSync(REAL_DATA_PATH, JSON.stringify({ guilds: {} }), "utf-8");
  }
}

describe("strikeStore", () => {
  beforeEach(cleanRealFile);
  afterEach(cleanRealFile);

  it("adds a strike and returns the active count", async () => {
    const { addStrike, getActiveStrikes, STRIKE_THRESHOLD } = await loadStore();
    const result = addStrike("g1", "u1", "spam", "mod1", "Mod#1");
    expect(result.activeCount).toBe(1);
    expect(result.reachedThreshold).toBe(false);
    expect(result.strike.reason).toBe("spam");
    expect(result.strike.id).toMatch(/^[0-9a-f]{6}$/);
    expect(STRIKE_THRESHOLD).toBe(4);

    const active = getActiveStrikes("g1", "u1");
    expect(active).toHaveLength(1);
    expect(active[0].reason).toBe("spam");
  });

  it("flags reachedThreshold at exactly 4 strikes", async () => {
    const { addStrike } = await loadStore();
    addStrike("g1", "u1", "a", "mod", "Mod");
    addStrike("g1", "u1", "b", "mod", "Mod");
    addStrike("g1", "u1", "c", "mod", "Mod");
    const fourth = addStrike("g1", "u1", "d", "mod", "Mod");
    expect(fourth.activeCount).toBe(4);
    expect(fourth.reachedThreshold).toBe(true);
  });

  it("persists strikes across reads (survives 'leaving' since storage is keyed by userId)", async () => {
    const { addStrike } = await loadStore();
    addStrike("g1", "u1", "spam", "mod", "Mod");

    // Simulate a fresh module load (e.g. process restart)
    vi.resetModules();
    const { getActiveStrikes } = await loadStore();
    expect(getActiveStrikes("g1", "u1")).toHaveLength(1);
  });

  it("expires strikes after 60 days", async () => {
    const { addStrike, getActiveStrikes } = await loadStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    addStrike("g1", "u1", "old", "mod", "Mod");

    // Move forward 61 days
    vi.setSystemTime(new Date("2026-03-03T00:00:00Z"));

    const active = getActiveStrikes("g1", "u1");
    expect(active).toHaveLength(0);

    vi.useRealTimers();
  });

  it("still has strikes one day before expiry", async () => {
    const { addStrike, getActiveStrikes } = await loadStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    addStrike("g1", "u1", "fresh", "mod", "Mod");

    vi.setSystemTime(new Date("2026-03-01T00:00:00Z")); // ~59 days later

    const active = getActiveStrikes("g1", "u1");
    expect(active).toHaveLength(1);

    vi.useRealTimers();
  });

  it("removes a strike by ID", async () => {
    const { addStrike, removeStrike, getActiveStrikes } = await loadStore();
    const r1 = addStrike("g1", "u1", "a", "mod", "Mod");
    addStrike("g1", "u1", "b", "mod", "Mod");

    const removed = removeStrike("g1", "u1", r1.strike.id);
    expect(removed).not.toBeNull();
    expect(removed?.reason).toBe("a");
    expect(getActiveStrikes("g1", "u1")).toHaveLength(1);
  });

  it("removeStrike returns null for unknown ID", async () => {
    const { addStrike, removeStrike } = await loadStore();
    addStrike("g1", "u1", "a", "mod", "Mod");
    expect(removeStrike("g1", "u1", "nope")).toBeNull();
  });

  it("clearStrikes wipes all strikes for a user", async () => {
    const { addStrike, clearStrikes, getActiveStrikes } = await loadStore();
    addStrike("g1", "u1", "a", "mod", "Mod");
    addStrike("g1", "u1", "b", "mod", "Mod");
    addStrike("g1", "u1", "c", "mod", "Mod");

    const cleared = clearStrikes("g1", "u1");
    expect(cleared).toBe(3);
    expect(getActiveStrikes("g1", "u1")).toHaveLength(0);
  });

  it("scopes strikes per guild — same userId in another guild is separate", async () => {
    const { addStrike, getActiveStrikes } = await loadStore();
    addStrike("g1", "u1", "a", "mod", "Mod");
    addStrike("g2", "u1", "b", "mod", "Mod");

    expect(getActiveStrikes("g1", "u1")).toHaveLength(1);
    expect(getActiveStrikes("g2", "u1")).toHaveLength(1);
  });

  it("pruneAllExpired removes only expired strikes and reports remaining count", async () => {
    const { addStrike, pruneAllExpired, getActiveStrikes } = await loadStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    addStrike("g1", "u1", "old", "mod", "Mod");

    vi.setSystemTime(new Date("2026-02-15T00:00:00Z")); // 45 days in
    addStrike("g1", "u1", "newer", "mod", "Mod");

    vi.setSystemTime(new Date("2026-03-05T00:00:00Z")); // 63 days from first
    const expired = pruneAllExpired();
    expect(expired).toHaveLength(1);
    expect(expired[0].strike.reason).toBe("old");
    expect(expired[0].guildId).toBe("g1");
    expect(expired[0].userId).toBe("u1");
    expect(expired[0].remainingActive).toBe(1);

    const active = getActiveStrikes("g1", "u1");
    expect(active).toHaveLength(1);
    expect(active[0].reason).toBe("newer");

    vi.useRealTimers();
  });

  it("listUsersWithStrikes returns users sorted by active strike count desc", async () => {
    const { addStrike, listUsersWithStrikes } = await loadStore();
    addStrike("g1", "u1", "a", "mod", "Mod");
    addStrike("g1", "u2", "b", "mod", "Mod");
    addStrike("g1", "u2", "c", "mod", "Mod");
    addStrike("g1", "u2", "d", "mod", "Mod");
    addStrike("g1", "u3", "e", "mod", "Mod");
    addStrike("g1", "u3", "f", "mod", "Mod");

    const summaries = listUsersWithStrikes("g1");
    expect(summaries.map((s) => s.userId)).toEqual(["u2", "u3", "u1"]);
    expect(summaries.map((s) => s.strikes.length)).toEqual([3, 2, 1]);
  });

  it("listUsersWithStrikes excludes users whose strikes have all expired", async () => {
    const { addStrike, listUsersWithStrikes } = await loadStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    addStrike("g1", "u1", "old", "mod", "Mod");

    vi.setSystemTime(new Date("2026-02-15T00:00:00Z")); // 45 days in
    addStrike("g1", "u2", "fresh", "mod", "Mod");

    vi.setSystemTime(new Date("2026-03-05T00:00:00Z")); // u1's strike has expired
    const summaries = listUsersWithStrikes("g1");
    expect(summaries.map((s) => s.userId)).toEqual(["u2"]);

    vi.useRealTimers();
  });

  it("listUsersWithStrikes returns empty array for unknown guild", async () => {
    const { listUsersWithStrikes } = await loadStore();
    expect(listUsersWithStrikes("nope")).toEqual([]);
  });
});
