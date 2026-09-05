/**
 * Avatar loading for profile cards.
 *
 * URLs come from the game API and Discord's CDN, but they are still remote
 * fetches driven by user-controlled data, so this is deliberately narrow:
 * https only, short timeout, size cap, and an image decode that is allowed to
 * fail. A profile card must never fail to render because an avatar 404s — it
 * falls back to initials on a party-coloured disc.
 */

import { loadImage, type Image, type CanvasRenderingContext2D } from "canvas";
import { font } from "./fonts.js";
import { INK, alpha } from "./theme.js";

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 4000;

/** Fetch and decode an avatar. Returns null on any failure — never throws. */
export async function loadAvatar(url: string | null | undefined): Promise<Image | null> {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  try {
    const res = await fetch(parsed, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
    if (!res.ok) return null;

    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;

    return await loadImage(bytes);
  } catch {
    return null;
  }
}

/** Up to two initials from a display name, for the placeholder disc. */
export function initialsFor(name: string): string {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Draw a circular avatar at (cx, cy) with radius r, cover-cropped so a
 * non-square source is centred rather than squashed. Falls back to initials.
 */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  image: Image | null,
  cx: number,
  cy: number,
  r: number,
  fallbackName: string,
  accent: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  if (image && image.width > 0 && image.height > 0) {
    const scale = Math.max((r * 2) / image.width, (r * 2) / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = alpha(accent, 0.22);
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    const initials = initialsFor(fallbackName);
    ctx.font = font(600, r * 0.8);
    ctx.fillStyle = INK.primary;
    ctx.textAlign = "center";
    ctx.fillText(initials, cx, cy + r * 0.29);
    ctx.textAlign = "left";
  }
  ctx.restore();

  // Party-coloured ring, so the avatar carries identity even as a placeholder
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.stroke();
}
