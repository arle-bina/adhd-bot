/**
 * The house card — the frame every AHD chart is drawn inside.
 *
 * Anatomy, top to bottom:
 *
 *   ▌ Title                             <- brand accent rule + Geist SemiBold
 *     Subtitle / scope                  <- muted, optional
 *   ┌───────────────────────────────┐
 *   │  plot surface                 │   <- handed to the caller's draw fn
 *   └───────────────────────────────┘
 *   ─────────────────────────────────
 *   left footer          right footer   <- muted mono, hairline above
 *
 * Callers never touch the chrome; they get a plot rect and draw into it. That
 * is what keeps /marketshare, /forex and /predict looking like one product.
 */

import { createCanvas, type CanvasRenderingContext2D, type Canvas } from "canvas";
import { ensureFonts, font } from "./fonts.js";
import { drawBrandMark } from "./brand.js";
import { AXIS, BRAND, GEO, INK, SURFACE, TYPE } from "./theme.js";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardSpec {
  title: string;
  subtitle?: string;
  /** Bottom-left footer, e.g. "Turn 612 · Values USD". */
  footerLeft?: string;
  /** Bottom-right footer. Defaults to the site attribution. */
  footerRight?: string;
  /** Logical width in px. Rendered at 2x. */
  width?: number;
  /** Logical height in px. Rendered at 2x. */
  height?: number;
}

export const SITE = "ahousedividedgame.com";

/** Rounded-rectangle path. node-canvas has no `roundRect` on older builds. */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** Truncate `text` to fit `maxWidth`, appending an ellipsis when it doesn't. */
export function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ell = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + ell).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo <= 0 ? ell : text.slice(0, lo) + ell;
}

/**
 * Height the chrome consumes, so callers can size a card to its content.
 * `rows * rowHeight + chromeHeight(spec)` gives an exact-fit card.
 */
export function chromeHeight(spec: Pick<CardSpec, "subtitle" | "footerLeft" | "footerRight">): number {
  const header = GEO.padTop + TYPE.title + (spec.subtitle ? TYPE.subtitle + 6 : 0) + GEO.headerGap;
  const hasFooter = Boolean(spec.footerLeft ?? spec.footerRight ?? SITE);
  const footer = hasFooter ? GEO.footerGap + TYPE.footer + GEO.padBottom : GEO.padBottom;
  return header + footer;
}

/**
 * Draw the card chrome and hand the plot rect to `draw`.
 *
 * The returned buffer is a PNG at `GEO.dpr` times the logical size; the context
 * passed to `draw` is already scaled, so draw in logical units throughout.
 */
export function renderCard(
  spec: CardSpec,
  draw: (ctx: CanvasRenderingContext2D, plot: Rect) => void,
): Buffer {
  ensureFonts();

  const W = spec.width ?? 640;
  const H = spec.height ?? 360;
  const canvas: Canvas = createCanvas(W * GEO.dpr, H * GEO.dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(GEO.dpr, GEO.dpr);
  ctx.textBaseline = "alphabetic";

  // Page
  ctx.fillStyle = SURFACE.page;
  ctx.fillRect(0, 0, W, H);

  // ── Header ────────────────────────────────────────────────────────────────
  const titleTop = GEO.padTop;
  const titleBaseline = titleTop + TYPE.title * 0.82;

  // Brand accent rule, cap-height tall, sitting flush with the title's left edge
  ctx.fillStyle = BRAND.primary;
  roundRect(ctx, GEO.padX, titleTop + 1.5, GEO.accentRuleW, TYPE.title * 0.86, GEO.accentRuleW / 2);
  ctx.fill();

  // Brand mark, top right. Title width is reserved for it whether or not the
  // asset decoded, so the header does not reflow when it is missing.
  const markSize = GEO.markSize;
  const markX = W - GEO.padX - markSize;
  drawBrandMark(ctx, markX, titleTop, markSize);

  const textX = GEO.padX + GEO.accentRuleW + 10;
  const textMaxW = W - textX - GEO.padX - markSize - 14;

  ctx.font = font(600, TYPE.title);
  ctx.fillStyle = INK.primary;
  ctx.fillText(ellipsize(ctx, spec.title, textMaxW), textX, titleBaseline);

  let headerBottom = titleTop + TYPE.title;
  if (spec.subtitle) {
    ctx.font = font(400, TYPE.subtitle);
    ctx.fillStyle = INK.muted;
    ctx.fillText(ellipsize(ctx, spec.subtitle, textMaxW), textX, headerBottom + TYPE.subtitle * 0.8 + 4);
    headerBottom += TYPE.subtitle + 6;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerRight = spec.footerRight ?? SITE;
  const footerLeft = spec.footerLeft ?? "";
  const hasFooter = Boolean(footerLeft || footerRight);
  const footerBaseline = H - GEO.padBottom;
  const plotBottom = hasFooter ? footerBaseline - TYPE.footer - GEO.footerGap : H - GEO.padBottom;

  // ── Plot surface ──────────────────────────────────────────────────────────
  const plot: Rect = {
    x: GEO.padX,
    y: headerBottom + GEO.headerGap,
    w: W - GEO.padX * 2,
    h: Math.max(1, plotBottom - (headerBottom + GEO.headerGap)),
  };

  ctx.fillStyle = SURFACE.plot;
  roundRect(ctx, plot.x, plot.y, plot.w, plot.h, GEO.plotRadius);
  ctx.fill();
  ctx.strokeStyle = SURFACE.border;
  ctx.lineWidth = 1;
  roundRect(ctx, plot.x + 0.5, plot.y + 0.5, plot.w - 1, plot.h - 1, GEO.plotRadius);
  ctx.stroke();

  // Caller's chart, clipped to the plot surface so nothing bleeds into chrome
  ctx.save();
  roundRect(ctx, plot.x, plot.y, plot.w, plot.h, GEO.plotRadius);
  ctx.clip();
  draw(ctx, plot);
  ctx.restore();

  if (hasFooter) {
    ctx.strokeStyle = AXIS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const ruleY = plot.y + plot.h + GEO.footerGap * 0.55;
    ctx.moveTo(GEO.padX, ruleY + 0.5);
    ctx.lineTo(W - GEO.padX, ruleY + 0.5);
    ctx.stroke();

    ctx.font = font(400, TYPE.footer, "mono");
    ctx.fillStyle = INK.muted;
    if (footerLeft) {
      ctx.textAlign = "left";
      ctx.fillText(ellipsize(ctx, footerLeft, plot.w * 0.62), GEO.padX, footerBaseline);
    }
    if (footerRight) {
      ctx.textAlign = "right";
      ctx.fillText(footerRight, W - GEO.padX, footerBaseline);
    }
    ctx.textAlign = "left";
  }

  return canvas.toBuffer("image/png");
}

/** Centred "no data" state, so an empty result still looks intentional. */
export function drawEmptyState(ctx: CanvasRenderingContext2D, plot: Rect, message: string): void {
  ctx.font = font(400, TYPE.label);
  ctx.fillStyle = INK.muted;
  ctx.textAlign = "center";
  ctx.fillText(message, plot.x + plot.w / 2, plot.y + plot.h / 2 + TYPE.label * 0.35);
  ctx.textAlign = "left";
}
