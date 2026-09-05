/**
 * Brand font registration for node-canvas.
 *
 * Geist Sans and JetBrains Mono are the game site's own faces (see AHDGame
 * `layout.tsx`). They are vendored under `assets/fonts/` — both SIL OFL 1.1,
 * licences shipped alongside — because the render host has no brand fonts
 * installed and would silently fall back to DejaVu, which looks nothing like
 * the site.
 *
 * Registration is process-wide and must happen before any canvas draws text.
 */

import { registerFont } from "canvas";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FONT } from "./theme.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve `assets/fonts` from either `src/utils/viz` (tsx dev) or
 * `dist/utils/viz` (compiled). Both sit three levels below the package root.
 */
function fontDir(): string | null {
  const candidates = [
    resolve(HERE, "../../../assets/fonts"),
    resolve(HERE, "../../../../assets/fonts"),
    resolve(process.cwd(), "assets/fonts"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

const FACES: Array<{ file: string; family: string; weight: string; style?: string }> = [
  { file: "Geist-Regular.ttf", family: FONT.sans, weight: "400" },
  { file: "Geist-Medium.ttf", family: FONT.sans, weight: "500" },
  { file: "Geist-SemiBold.ttf", family: FONT.sans, weight: "600" },
  { file: "Geist-Bold.ttf", family: FONT.sans, weight: "700" },
  { file: "JetBrainsMono-Regular.ttf", family: FONT.mono, weight: "400" },
  { file: "JetBrainsMono-Medium.ttf", family: FONT.mono, weight: "500" },
  { file: "JetBrainsMono-Bold.ttf", family: FONT.mono, weight: "700" },
];

let registered = false;
let available = false;

/**
 * Register the brand faces once. Safe to call on every render.
 *
 * Returns whether the brand faces are actually available — callers don't need
 * to branch on it (the font stacks in `card.ts` list generic fallbacks), but
 * `ensureFonts()` failing silently in production is worth being able to assert
 * on in tests.
 */
export function ensureFonts(): boolean {
  if (registered) return available;
  registered = true;

  const dir = fontDir();
  if (!dir) return available;

  let loaded = 0;
  for (const face of FACES) {
    const path = join(dir, face.file);
    if (!existsSync(path)) continue;
    try {
      registerFont(path, { family: face.family, weight: face.weight, style: face.style ?? "normal" });
      loaded++;
    } catch {
      // A single unreadable face must not take the whole chart pipeline down —
      // canvas falls back to the next family in the stack.
    }
  }
  available = loaded > 0;
  return available;
}

/** Build a canvas font string against the brand stack, with generic fallbacks. */
export function font(weight: number, size: number, family: keyof typeof FONT = "sans"): string {
  const stack =
    family === "mono"
      ? `"${FONT.mono}", "DejaVu Sans Mono", monospace`
      : `"${FONT.sans}", "DejaVu Sans", sans-serif`;
  return `${weight} ${size}px ${stack}`;
}
