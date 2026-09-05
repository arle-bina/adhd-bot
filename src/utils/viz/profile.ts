/**
 * Player profile card — a tall card in the shape people already know from
 * Discord levelling bots: avatar and identity up top, headline figures under
 * it, then the detail.
 *
 * The old profile embed was thirteen inline fields, which Discord reflows into
 * an unreadable grid on mobile. This carries the whole profile as one image.
 *
 * Deliberately absent: meters for PI, NPI, actions and donor base. None of them
 * has a ceiling the bot is told about, so a bar would be inventing a
 * denominator. Only approval and infamy have a real 0–100 domain. Those two get
 * meters; everything else is a figure.
 */

import { createCanvas, type Image, type CanvasRenderingContext2D } from "canvas";
import { ellipsize, encodePng, roundRect, SITE, type Rect } from "./card.js";
import { ensureFonts, font } from "./fonts.js";
import { drawAvatar, loadAvatar } from "./avatar.js";
import { drawBrandMark, warmBrandAssets } from "./brand.js";
import { AXIS, BRAND, GEO, INK, STATUS, SURFACE, TYPE, alpha, brandColor } from "./theme.js";

export interface ProfileStat {
  label: string;
  value: string;
  /** Optional muted qualifier below the figure, e.g. "investor rank #2". */
  note?: string;
}

export interface ProfileMeter {
  label: string;
  /** 0–100. Only use for values with a real, known domain. */
  value: number;
  display: string;
  color: string;
}

export interface ProfileRow {
  label: string;
  value: string;
}

export interface EntityCardOptions {
  name: string;
  /** e.g. "Senator · Vermont". */
  position?: string;
  /** Short label drawn as a chip in the accent colour — a party, an ideology. */
  chip?: string | null;
  /** Party colour, or a categorical slot if the party has none. */
  accent?: string | null;
  avatarUrl?: string | null;
  /** Already-decoded avatar. Skips the fetch — used by tests and previews. */
  avatarImage?: Image | null;
  /** Small muted line under the party chip, e.g. an active election. */
  banner?: string | null;
  /** Standing badges — supporter tier, moderator, admin. Drawn beside the chip. */
  badges?: Array<{ label: string; color: string }>;

  /** Economic axis, -100..100. Positive is left, per the game's own scale. */
  economic?: number | null;
  /** Social axis, -100..100. Positive is progressive. */
  social?: number | null;

  /** Three headline figures. */
  headline: ProfileStat[];
  meters: ProfileMeter[];
  /** Label/value detail rows beside the compass. */
  rows: ProfileRow[];

  footerLeft?: string;
  footerRight?: string;
  width?: number;
}

const PAD = 20;
const AVATAR_R = 42;

/** Load the avatar, then render. Never rejects on a bad avatar URL. */
export async function renderEntityCard(o: EntityCardOptions): Promise<Buffer> {
  const [image] = await Promise.all([
    o.avatarImage ? Promise.resolve(o.avatarImage) : loadAvatar(o.avatarUrl),
    warmBrandAssets(),
  ]);
  return renderEntityCardSync({ ...o, avatarImage: image });
}

export function renderEntityCardSync(o: EntityCardOptions): Buffer {
  ensureFonts();

  const W = o.width ?? 640;
  const accent = brandColor(o.accent, 0);
  const hasCompass = o.economic != null && o.social != null;

  const identityH = PAD + AVATAR_R * 2 + 18;
  const headlineH = o.headline.length ? 60 : 0;
  const metersH = o.meters.length * 34 + (o.meters.length ? 8 : 0);
  const detailH = hasCompass ? 176 : Math.max(0, o.rows.length * 24 + PAD);
  const footerH = 34;
  const H = Math.round(identityH + headlineH + metersH + detailH + footerH + PAD);

  const canvas = createCanvas(W * GEO.dpr, H * GEO.dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(GEO.dpr, GEO.dpr);
  ctx.textBaseline = "alphabetic";

  // Page + a party-coloured band down the left edge
  ctx.fillStyle = SURFACE.page;
  ctx.fillRect(0, 0, W, H);
  const band = ctx.createLinearGradient(0, 0, 0, H);
  band.addColorStop(0, accent);
  band.addColorStop(1, alpha(accent, 0.15));
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, 4, H);

  let y = PAD;

  // ── Identity ──────────────────────────────────────────────────────────────
  const ax = PAD + 8 + AVATAR_R;
  const ay = y + AVATAR_R;
  drawAvatar(ctx, o.avatarImage ?? null, ax, ay, AVATAR_R, o.name, accent);

  const tx = ax + AVATAR_R + 20;
  const tMax = W - tx - PAD - GEO.markSize - 12;

  drawBrandMark(ctx, W - PAD - GEO.markSize, y + 2, GEO.markSize);

  ctx.font = font(700, 26);
  ctx.fillStyle = INK.primary;
  ctx.fillText(ellipsize(ctx, o.name, tMax), tx, y + 26);

  if (o.position) {
    ctx.font = font(400, 13.5);
    ctx.fillStyle = INK.secondary;
    ctx.fillText(ellipsize(ctx, o.position, tMax), tx, y + 47);
  }

  // Party chip, then any standing badges on the same row. Badges are drawn in
  // their own colours rather than the party's, so a supporter chip does not
  // read as a second party affiliation.
  let chipX = tx;
  if (o.chip) {
    ctx.font = font(600, 11);
    const label = ellipsize(ctx, o.chip, tMax - 20);
    const cw = ctx.measureText(label).width + 18;
    ctx.fillStyle = alpha(accent, 0.2);
    roundRect(ctx, chipX, y + 56, cw, 20, 10);
    ctx.fill();
    ctx.strokeStyle = alpha(accent, 0.5);
    ctx.lineWidth = 1;
    roundRect(ctx, chipX + 0.5, y + 56.5, cw - 1, 19, 9.5);
    ctx.stroke();
    ctx.fillStyle = INK.primary;
    ctx.fillText(label, chipX + 9, y + 70);
    chipX += cw + 6;
  }

  for (const badge of o.badges ?? []) {
    ctx.font = font(700, 9);
    const bw = ctx.measureText(badge.label).width + 14;
    // Stop rather than overflow into the brand mark.
    if (chipX + bw > W - PAD - GEO.markSize - 10) break;
    ctx.fillStyle = alpha(badge.color, 0.22);
    roundRect(ctx, chipX, y + 57, bw, 18, 9);
    ctx.fill();
    ctx.strokeStyle = alpha(badge.color, 0.55);
    ctx.lineWidth = 1;
    roundRect(ctx, chipX + 0.5, y + 57.5, bw - 1, 17, 8.5);
    ctx.stroke();
    ctx.fillStyle = badge.color;
    ctx.fillText(badge.label, chipX + 7, y + 69.5);
    chipX += bw + 5;
  }

  if (o.banner) {
    ctx.font = font(400, 11);
    ctx.fillStyle = INK.muted;
    ctx.fillText(ellipsize(ctx, o.banner, tMax), tx, y + 92);
  }

  y += AVATAR_R * 2 + 18;

  // ── Headline figures ──────────────────────────────────────────────────────
  if (o.headline.length) {
    const colW = (W - PAD * 2 - 8) / o.headline.length;
    o.headline.forEach((stat, i) => {
      const x = PAD + 8 + i * colW;
      ctx.font = font(500, 9.5, "mono");
      ctx.fillStyle = INK.muted;
      ctx.fillText(stat.label.toUpperCase(), x, y + 12);

      ctx.font = font(600, 22, "mono");
      ctx.fillStyle = INK.primary;
      ctx.fillText(ellipsize(ctx, stat.value, colW - 10), x, y + 38);

      if (stat.note) {
        ctx.font = font(400, 9.5, "mono");
        ctx.fillStyle = INK.muted;
        ctx.fillText(ellipsize(ctx, stat.note, colW - 10), x, y + 51);
      }
    });
    y += 60;
  }

  // ── Meters ────────────────────────────────────────────────────────────────
  if (o.meters.length) {
    const x0 = PAD + 8;
    const w = W - PAD * 2 - 8;
    o.meters.forEach((meter, i) => {
      const top = y + i * 34 + 10;

      ctx.font = font(500, TYPE.footer, "mono");
      ctx.fillStyle = INK.secondary;
      ctx.fillText(meter.label.toUpperCase(), x0, top);

      ctx.textAlign = "right";
      ctx.font = font(600, TYPE.value, "mono");
      ctx.fillStyle = INK.primary;
      ctx.fillText(meter.display, x0 + w, top);
      ctx.textAlign = "left";

      ctx.fillStyle = AXIS.grid;
      roundRect(ctx, x0, top + 7, w, 8, 4);
      ctx.fill();

      const pct = Math.max(0, Math.min(100, meter.value)) / 100;
      if (pct > 0) {
        ctx.fillStyle = meter.color;
        roundRect(ctx, x0, top + 7, Math.max(4, w * pct), 8, 4);
        ctx.fill();
      }
    });
    y += o.meters.length * 34 + 8;
  }

  // ── Detail panel: compass beside the remaining figures ────────────────────
  const panel: Rect = { x: PAD + 8, y: y + 4, w: W - PAD * 2 - 8, h: H - y - footerH - PAD };
  ctx.fillStyle = SURFACE.plot;
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 10);
  ctx.fill();
  ctx.strokeStyle = SURFACE.border;
  ctx.lineWidth = 1;
  roundRect(ctx, panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1, 10);
  ctx.stroke();

  const compassW = hasCompass ? Math.min(panel.h + 24, panel.w * 0.46) : 0;
  if (hasCompass) {
    drawCompass(ctx, { x: panel.x, y: panel.y, w: compassW, h: panel.h }, o.economic!, o.social!, accent);
    ctx.strokeStyle = AXIS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(panel.x + compassW) + 0.5, panel.y + 14);
    ctx.lineTo(Math.round(panel.x + compassW) + 0.5, panel.y + panel.h - 14);
    ctx.stroke();
  }

  drawDetailRows(ctx, { x: panel.x + compassW, y: panel.y, w: panel.w - compassW, h: panel.h }, o.rows);

  // ── Footer ────────────────────────────────────────────────────────────────
  ctx.strokeStyle = AXIS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD + 8, H - PAD - 14.5);
  ctx.lineTo(W - PAD, H - PAD - 14.5);
  ctx.stroke();

  ctx.font = font(400, TYPE.footer, "mono");
  ctx.fillStyle = INK.muted;
  if (o.footerLeft) ctx.fillText(ellipsize(ctx, o.footerLeft, panel.w * 0.6), PAD + 8, H - PAD + 1);
  ctx.textAlign = "right";
  ctx.fillText(o.footerRight ?? SITE, W - PAD, H - PAD + 1);
  ctx.textAlign = "left";

  return encodePng(canvas);
}

/**
 * Two-axis political compass. Turns `economic: 34 / social: 51` — two numbers
 * nobody can picture — into a position, which is the whole point of plotting.
 */
function drawCompass(
  ctx: CanvasRenderingContext2D,
  box: Rect,
  economic: number,
  social: number,
  accent: string,
): void {
  const pad = 16;
  ctx.font = font(500, 9.5, "mono");
  ctx.fillStyle = INK.muted;
  ctx.fillText("POLITICAL COMPASS", box.x + pad, box.y + pad + 6);

  const top = box.y + pad + 22;
  const size = Math.min(box.w - pad * 2 - 22, box.h - (top - box.y) - pad - 18);
  const x0 = box.x + pad + 14;
  const y0 = top;

  ctx.fillStyle = alpha(INK.primary, 0.035);
  roundRect(ctx, x0, y0, size, size, 6);
  ctx.fill();
  ctx.strokeStyle = AXIS.grid;
  ctx.lineWidth = 1;
  roundRect(ctx, x0 + 0.5, y0 + 0.5, size - 1, size - 1, 6);
  ctx.stroke();

  for (const f of [0.25, 0.75]) {
    ctx.beginPath();
    ctx.moveTo(Math.round(x0 + size * f) + 0.5, y0);
    ctx.lineTo(Math.round(x0 + size * f) + 0.5, y0 + size);
    ctx.moveTo(x0, Math.round(y0 + size * f) + 0.5);
    ctx.lineTo(x0 + size, Math.round(y0 + size * f) + 0.5);
    ctx.stroke();
  }

  ctx.strokeStyle = AXIS.baseline;
  ctx.beginPath();
  ctx.moveTo(Math.round(x0 + size / 2) + 0.5, y0);
  ctx.lineTo(Math.round(x0 + size / 2) + 0.5, y0 + size);
  ctx.moveTo(x0, Math.round(y0 + size / 2) + 0.5);
  ctx.lineTo(x0 + size, Math.round(y0 + size / 2) + 0.5);
  ctx.stroke();

  // Axis ends, so orientation is never guessed
  ctx.font = font(500, 8.5, "mono");
  ctx.fillStyle = INK.muted;
  ctx.textAlign = "center";
  ctx.fillText("PROG", x0 + size / 2, y0 - 5);
  ctx.fillText("CONS", x0 + size / 2, y0 + size + 12);
  ctx.save();
  ctx.translate(x0 - 6, y0 + size / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("LEFT", 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(x0 + size + 12, y0 + size / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText("RIGHT", 0, 0);
  ctx.restore();
  ctx.textAlign = "left";

  // Positive economic is left on the game's scale, so x is inverted to put
  // left on the left.
  const clamp = (v: number) => Math.max(-100, Math.min(100, v));
  const px = x0 + size / 2 - (clamp(economic) / 100) * (size / 2 - 8);
  const py = y0 + size / 2 - (clamp(social) / 100) * (size / 2 - 8);

  ctx.fillStyle = alpha(accent, 0.18);
  ctx.beginPath();
  ctx.arc(px, py, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = SURFACE.plot;
  ctx.lineWidth = 2;
  ctx.stroke();

  // The figures spelled out — a dot alone is not readable to a screen reader
  ctx.font = font(500, 9.5, "mono");
  ctx.fillStyle = INK.secondary;
  ctx.textAlign = "center";
  ctx.fillText(`ECON ${signed(clamp(economic))} · SOC ${signed(clamp(social))}`, x0 + size / 2, y0 + size + 26);
  ctx.textAlign = "left";
}

function signed(v: number): string {
  const r = Math.round(v);
  return `${r > 0 ? "+" : ""}${r}`;
}

/** Label/value rows, dot-leadered so the eye tracks across the gap. */
function drawDetailRows(ctx: CanvasRenderingContext2D, box: Rect, rows: ProfileRow[]): void {
  if (rows.length === 0) return;
  const pad = 18;
  const x0 = box.x + pad;
  const right = box.x + box.w - pad;
  const available = box.h - pad * 2;
  const pitch = Math.min(26, available / rows.length);
  let y = box.y + pad + Math.max(0, (available - pitch * rows.length) / 2) + pitch * 0.62;

  for (const row of rows) {
    ctx.font = font(500, 10.5, "mono");
    ctx.fillStyle = INK.muted;
    ctx.fillText(row.label.toUpperCase(), x0, y);
    const labelW = ctx.measureText(row.label.toUpperCase()).width;

    ctx.textAlign = "right";
    ctx.font = font(600, 12, "mono");
    ctx.fillStyle = INK.primary;
    const valueW = ctx.measureText(row.value).width;
    ctx.fillText(ellipsize(ctx, row.value, box.w - pad * 2 - labelW - 16), right, y);
    ctx.textAlign = "left";

    const dotsFrom = x0 + labelW + 7;
    const dotsTo = right - valueW - 7;
    if (dotsTo > dotsFrom + 6) {
      ctx.strokeStyle = alpha(INK.muted, 0.3);
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 4]);
      ctx.beginPath();
      ctx.moveTo(dotsFrom, y - 3.5);
      ctx.lineTo(dotsTo, y - 3.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    y += pitch;
  }
}

/** Approval reads as a health bar: good high, warning mid, critical low. */
export function approvalColor(value: number): string {
  if (value >= 55) return STATUS.good;
  if (value >= 35) return STATUS.warning;
  return STATUS.critical;
}

/** Infamy is the inverse — high is bad. */
export function infamyColor(value: number): string {
  if (value >= 60) return STATUS.critical;
  if (value >= 30) return STATUS.warning;
  return INK.muted;
}

export { BRAND };
