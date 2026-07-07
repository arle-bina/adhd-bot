import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { writeJsonAtomic, readJsonSafe } from "../../src/utils/atomicJson.js";

describe("atomicJson", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "atomicjson-"));
    file = join(dir, "store.json");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("writes a valid, re-readable JSON file", () => {
    writeJsonAtomic(file, { counters: { g: 42 } });
    expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({ counters: { g: 42 } });
  });

  it("returns the fallback only when the file does not exist", () => {
    const fallback = { counters: {} };
    expect(readJsonSafe(file, { fallback })).toEqual(fallback);
  });

  it("REGRESSION #106: a corrupt file with no backup THROWS instead of resetting counters", () => {
    writeFileSync(file, "{ this is not json", "utf-8"); // simulate a truncated mid-write
    expect(() =>
      readJsonSafe(file, { fallback: { counters: {} }, onCorrupt: "throw" }),
    ).toThrow(/Refusing to continue with an empty store/);
  });

  it("recovers from the .bak snapshot when the primary is corrupt", () => {
    writeJsonAtomic(file, { counters: { g: 7 } }); // first good write (no .bak yet)
    writeJsonAtomic(file, { counters: { g: 8 } }); // second write snapshots g:7 to .bak
    expect(existsSync(`${file}.bak`)).toBe(true);
    writeFileSync(file, "corrupt", "utf-8"); // primary now unreadable
    const recovered = readJsonSafe<{ counters: Record<string, number> }>(file, {
      fallback: { counters: {} },
      onCorrupt: "throw",
    });
    expect(recovered.counters.g).toBe(7); // last-good backup, NOT a reset to {}
  });

  it("onCorrupt:'fallback' returns the fallback for regenerable state", () => {
    writeFileSync(file, "nope", "utf-8");
    expect(
      readJsonSafe(file, { fallback: { messages: 0 }, onCorrupt: "fallback" }),
    ).toEqual({ messages: 0 });
  });

  it("does not leave the .tmp file behind after a successful write", () => {
    writeJsonAtomic(file, { a: 1 });
    expect(existsSync(`${file}.${process.pid}.tmp`)).toBe(false);
  });
});
