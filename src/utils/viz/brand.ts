/**
 * The AHD mark, loaded once and drawn into the card chrome.
 *
 * `assets/brand/ahd-logo.png` is the same file the game site serves at
 * `/ahd-logo.png` — vendored rather than fetched so a chart never depends on
 * the CDN being up. It is a light mark on a white disc, so on the graphite card
 * it is drawn as-is and reads as a badge.
 */

import { loadImage, type Image, type CanvasRenderingContext2D } from "canvas";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function logoPath(): string | null {
  const candidates = [
    resolve(HERE, "../../../assets/brand/ahd-logo.png"),
    resolve(HERE, "../../../../assets/brand/ahd-logo.png"),
    resolve(process.cwd(), "assets/brand/ahd-logo.png"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

let cached: Image | null = null;
let loaded = false;

/**
 * Decode the mark once per process. Charts render synchronously, so this is
 * primed at startup by `warmBrandAssets()`; if it hasn't been, the mark is
 * simply omitted rather than the chart failing.
 */
export async function warmBrandAssets(): Promise<boolean> {
  if (loaded) return cached !== null;
  loaded = true;
  const path = logoPath();
  if (!path) return false;
  try {
    cached = await loadImage(path);
  } catch {
    cached = null;
  }
  return cached !== null;
}

export function brandMark(): Image | null {
  return cached;
}

/** Draw the mark at (x, y) with the given box size. No-op if not yet warmed. */
export function drawBrandMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): boolean {
  const mark = cached;
  if (!mark) return false;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(mark, x, y, size, size);
  ctx.restore();
  return true;
}
