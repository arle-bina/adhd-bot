import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { dirname } from "path";

/**
 * Write JSON durably: serialize to a temp file, snapshot the previous good file
 * to `<file>.bak`, then atomically rename the temp over the target. A crash at
 * any point leaves either the previous complete file or the new complete file —
 * never a truncated one. Replaces bare `writeFileSync`, which truncates in place
 * and can leave a half-written file if the process dies mid-write.
 */
export function writeJsonAtomic(file: string, data: unknown): void {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  if (existsSync(file)) {
    try {
      copyFileSync(file, `${file}.bak`);
    } catch {
      // backup is best-effort; the atomic rename below is the real guarantee
    }
  }
  renameSync(tmp, file);
}

export interface ReadJsonOptions<T> {
  /** Returned ONLY when the file genuinely does not exist (fresh install). */
  fallback: T;
  /**
   * What to do when the file EXISTS but neither it nor its `.bak` can be parsed.
   * "throw" (default) refuses to continue — correct for stores whose contents are
   * identity/counters (silently resetting would double-allocate). "fallback"
   * returns the fallback — acceptable for regenerable state.
   */
  onCorrupt?: "throw" | "fallback";
}

/**
 * Read JSON, distinguishing "file absent" (return fallback) from "file present but
 * corrupt" (recover from `.bak`, else throw/fallback per options). The bug this
 * guards against: a bare `try { parse } catch { return empty }` silently resets a
 * persistent counter to 0 on any partial/corrupt read.
 */
export function readJsonSafe<T>(file: string, opts: ReadJsonOptions<T>): T {
  if (!existsSync(file)) return opts.fallback;
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch (mainErr) {
    const bak = `${file}.bak`;
    if (existsSync(bak)) {
      try {
        const recovered = JSON.parse(readFileSync(bak, "utf-8")) as T;
        console.warn(`[atomicJson] ${file} was unreadable; recovered from ${bak}`);
        return recovered;
      } catch {
        // backup is also unusable; fall through to the onCorrupt policy
      }
    }
    if (opts.onCorrupt === "fallback") {
      console.error(`[atomicJson] ${file} corrupt and no valid backup; using fallback`);
      return opts.fallback;
    }
    throw new Error(
      `${file} exists but could not be parsed and no valid ${bak} was found. ` +
        `Refusing to continue with an empty store to avoid resetting persistent counters/state. ` +
        `Original error: ${(mainErr as Error).message}`,
    );
  }
}
