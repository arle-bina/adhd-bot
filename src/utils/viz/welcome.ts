/**
 * Welcome card — the image posted in #welcome when someone joins.
 *
 * It replaces the old text embed's greeting: the new member's avatar, their
 * name, and where they landed in the member count, drawn in the same house
 * style as /profile so the first thing a player sees from the bot already looks
 * like the game. The how-to-get-started copy stays in a real embed underneath,
 * because links and channel mentions only work as text.
 */

import { createCanvas, type Image } from "canvas";
import { ellipsize, encodePng, roundRect, SITE } from "./card.js";
import { ensureFonts, font } from "./fonts.js";
import { drawAvatar, loadAvatar } from "./avatar.js";
import { drawBrandMark, warmBrandAssets } from "./brand.js";
import { withRenderSlot } from "./limiter.js";
import { AXIS, BRAND, GEO, INK, SURFACE, alpha } from "./theme.js";

export interface WelcomeCardOptions {
  /** Server display name: nickname, then global name, then username. */
  displayName: string;
  /** Discord username, drawn as a muted @handle when it differs from the name. */
  username?: string | null;
  avatarUrl?: string | null;
  /** Already-decoded avatar. Skips the fetch — used by tests and previews. */
  avatarImage?: Image | null;
  /** The guild's member count including this member. */
  memberNumber?: number | null;
  /** Bottom-left footer, normally the server name. */
  footerLeft?: string;
}

export const WELCOME_CARD = { width: 800, height: 280 } as const;

const PAD = 28;
const AVATAR_R = 84;

/** Load the avatar, then render. Never rejects on a bad avatar URL. */
export function renderWelcomeCard(o: WelcomeCardOptions): Promise<Buffer> {
  return withRenderSlot(async () => {
    const [image] = await Promise.all([
      o.avatarImage ? Promise.resolve(o.avatarImage) : loadAvatar(o.avatarUrl),
      warmBrandAssets(),
    ]);
    return renderWelcomeCardSync({ ...o, avatarImage: image });
  });
}

export function renderWelcomeCardSync(o: WelcomeCardOptions): Buffer {
  ensureFonts();

  const { width: W, height: H } = WELCOME_CARD;
  const canvas = createCanvas(W * GEO.dpr, H * GEO.dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(GEO.dpr, GEO.dpr);
  ctx.textBaseline = "alphabetic";

  // Page, with a brand band down the left edge as on the profile card
  ctx.fillStyle = SURFACE.page;
  ctx.fillRect(0, 0, W, H);
  const band = ctx.createLinearGradient(0, 0, 0, H);
  band.addColorStop(0, BRAND.primary);
  band.addColorStop(1, alpha(BRAND.primary, 0.15));
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, 4, H);

  const footerH = 36;
  const bodyH = H - footerH;

  // ── Avatar ────────────────────────────────────────────────────────────────
  const ax = PAD + 12 + AVATAR_R;
  const ay = bodyH / 2 + 4;

  // Soft halo so a dark avatar still separates from the page
  const halo = ctx.createRadialGradient(ax, ay, AVATAR_R * 0.9, ax, ay, AVATAR_R * 1.5);
  halo.addColorStop(0, alpha(BRAND.primary, 0.28));
  halo.addColorStop(1, alpha(BRAND.primary, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(ax, ay, AVATAR_R * 1.5, 0, Math.PI * 2);
  ctx.fill();

  drawAvatar(ctx, o.avatarImage ?? null, ax, ay, AVATAR_R, o.displayName, BRAND.primary);

  drawBrandMark(ctx, W - PAD - 40, PAD - 4, 40);

  // ── Identity ──────────────────────────────────────────────────────────────
  const tx = ax + AVATAR_R + 36;
  const tMax = W - tx - PAD;

  ctx.font = font(500, 13, "mono");
  ctx.fillStyle = INK.muted;
  ctx.fillText("WELCOME", tx, ay - 50);

  ctx.font = font(700, 40);
  ctx.fillStyle = INK.primary;
  ctx.fillText(ellipsize(ctx, o.displayName, tMax), tx, ay - 8);

  const handle = o.username && o.username.toLowerCase() !== o.displayName.toLowerCase() ? `@${o.username}` : null;
  if (handle) {
    ctx.font = font(400, 17);
    ctx.fillStyle = INK.secondary;
    ctx.fillText(ellipsize(ctx, handle, tMax), tx, ay + 20);
  }

  if (o.memberNumber && o.memberNumber > 0) {
    const label = `Member #${o.memberNumber.toLocaleString("en-US")}`;
    ctx.font = font(600, 13);
    const chipW = ctx.measureText(label).width + 22;
    const chipH = 26;
    const chipY = ay + (handle ? 36 : 14);
    ctx.fillStyle = alpha(BRAND.primary, 0.18);
    roundRect(ctx, tx, chipY, chipW, chipH, chipH / 2);
    ctx.fill();
    ctx.strokeStyle = alpha(BRAND.primary, 0.55);
    ctx.lineWidth = 1;
    roundRect(ctx, tx + 0.5, chipY + 0.5, chipW - 1, chipH - 1, chipH / 2);
    ctx.stroke();
    ctx.fillStyle = INK.primary;
    ctx.fillText(label, tx + 11, chipY + 17.5);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  ctx.strokeStyle = AXIS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, bodyH + 0.5);
  ctx.lineTo(W - PAD, bodyH + 0.5);
  ctx.stroke();

  const footerBaseline = H - 14;
  ctx.font = font(400, 11.5, "mono");
  ctx.fillStyle = INK.muted;
  ctx.textAlign = "right";
  ctx.fillText(SITE, W - PAD, footerBaseline);
  const siteW = ctx.measureText(SITE).width;
  ctx.textAlign = "left";
  if (o.footerLeft) {
    ctx.fillText(ellipsize(ctx, o.footerLeft, W - PAD * 2 - siteW - 24), PAD, footerBaseline);
  }

  return encodePng(canvas);
}
