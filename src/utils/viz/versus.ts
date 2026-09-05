/**
 * Head-to-head comparison — paired bars diverging from a centre line.
 *
 * The house form for /compare, /corpcompare and /party-compare. Two numbers in
 * a text row ("12,480 vs 11,020") make the reader do the division; two bars
 * off a shared centre make the gap a length.
 *
 * Every metric is scaled independently, because a comparison is per-row: an
 * influence figure and an approval percentage share no axis. That is stated on
 * the card rather than left for the reader to assume.
 */

import type { CanvasRenderingContext2D } from "canvas";
import { chromeHeight, drawEmptyState, ellipsize, renderCard, roundRect, type CardSpec, type Rect } from "./card.js";
import { font } from "./fonts.js";
import { AXIS, INK, SURFACE, TYPE, alpha, ensureVisible } from "./theme.js";

export interface VersusMetric {
  label: string;
  left: number;
  right: number;
  /** Display strings. Fall back to the raw numbers when omitted. */
  leftDisplay?: string;
  rightDisplay?: string;
  /** Infamy and debt lead by being smaller. Flips which side is marked ahead. */
  lowerIsBetter?: boolean;
  /** Suppress the lead marker where "ahead" is meaningless (ideology, age). */
  neutral?: boolean;
}

export interface VersusSide {
  name: string;
  /** Sub-line under the name — office, sector, country. */
  detail?: string;
  color?: string | null;
}

export interface VersusOptions extends Omit<CardSpec, "height"> {
  left: VersusSide;
  right: VersusSide;
  metrics: VersusMetric[];
  emptyMessage?: string;
}

const PAD = 18;
const HEAD_H = 52;
const ROW_H = 38;
const BAR_H = 12;
const GUTTER = 128;

export function versusHeight(metricCount: number, spec: Pick<CardSpec, "subtitle">): number {
  return Math.round(
    chromeHeight({ ...spec, footerLeft: " " }) + HEAD_H + Math.max(1, metricCount) * ROW_H + PAD * 2,
  );
}

export function renderVersus(options: VersusOptions): Buffer {
  const width = options.width ?? 700;
  const height = versusHeight(options.metrics.length, options);

  return renderCard({ ...options, width, height }, (ctx, plot) => {
    if (options.metrics.length === 0) {
      drawEmptyState(ctx, plot, options.emptyMessage ?? "Nothing to compare.");
      return;
    }
    draw(ctx, plot, options);
  });
}

function draw(ctx: CanvasRenderingContext2D, plot: Rect, o: VersusOptions): void {
  const leftColor = ensureVisible(o.left.color || "#3987e5");
  const rightColor = ensureVisible(o.right.color || "#e66767");

  const x0 = plot.x + PAD;
  const x1 = plot.x + plot.w - PAD;
  const cx = plot.x + plot.w / 2;

  // ── Heads ─────────────────────────────────────────────────────────────────
  drawHead(ctx, o.left, leftColor, x0, plot.y + PAD, "left");
  drawHead(ctx, o.right, rightColor, x1, plot.y + PAD, "right");

  ctx.font = font(500, 10, "mono");
  ctx.fillStyle = INK.muted;
  ctx.textAlign = "center";
  ctx.fillText("VS", cx, plot.y + PAD + 20);
  ctx.textAlign = "left";

  // ── Centre line ───────────────────────────────────────────────────────────
  const rowsTop = plot.y + PAD + HEAD_H;
  ctx.strokeStyle = AXIS.baseline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(cx) + 0.5, rowsTop - 4);
  ctx.lineTo(Math.round(cx) + 0.5, rowsTop + o.metrics.length * ROW_H - 6);
  ctx.stroke();

  // Half-width available to each side, minus the centre gutter for the label
  const half = (plot.w - PAD * 2 - GUTTER) / 2;

  o.metrics.forEach((metric, i) => {
    const top = rowsTop + i * ROW_H;
    const barY = top + 16;

    // Metric name, centred in the gutter
    ctx.font = font(500, 10, "mono");
    ctx.fillStyle = INK.muted;
    ctx.textAlign = "center";
    ctx.fillText(ellipsize(ctx, metric.label.toUpperCase(), GUTTER - 8), cx, top + 8);

    // Each metric is scaled to its own pair — an influence count and a
    // percentage share no axis, so a shared one would be a lie.
    const max = Math.max(Math.abs(metric.left), Math.abs(metric.right), Number.EPSILON);
    const lw = (Math.abs(metric.left) / max) * half;
    const rw = (Math.abs(metric.right) / max) * half;

    const gutterHalf = GUTTER / 2;
    // Left bar grows leftward from the gutter edge; right bar grows rightward.
    bar(ctx, cx - gutterHalf - lw, barY, lw, leftColor, "left");
    bar(ctx, cx + gutterHalf, barY, rw, rightColor, "right");

    const leader = metric.neutral
      ? null
      : metric.lowerIsBetter
        ? metric.left < metric.right
          ? "left"
          : metric.right < metric.left
            ? "right"
            : null
        : metric.left > metric.right
          ? "left"
          : metric.right > metric.left
            ? "right"
            : null;

    ctx.font = font(600, TYPE.value, "mono");
    ctx.textAlign = "left";
    ctx.fillStyle = leader === "left" ? INK.primary : INK.muted;
    ctx.fillText(metric.leftDisplay ?? String(metric.left), x0, barY + BAR_H - 2);

    ctx.textAlign = "right";
    ctx.fillStyle = leader === "right" ? INK.primary : INK.muted;
    ctx.fillText(metric.rightDisplay ?? String(metric.right), x1, barY + BAR_H - 2);
    ctx.textAlign = "left";
  });
}

/** Bar with rounded data-end and a square edge against the centre gutter. */
function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  color: string,
  grow: "left" | "right",
): void {
  const width = Math.max(2, w);
  const r = Math.min(4, width);
  ctx.beginPath();
  if (grow === "right") {
    ctx.moveTo(x, y);
    ctx.lineTo(x + width - r, y);
    ctx.arcTo(x + width, y, x + width, y + r, r);
    ctx.lineTo(x + width, y + BAR_H - r);
    ctx.arcTo(x + width, y + BAR_H, x + width - r, y + BAR_H, r);
    ctx.lineTo(x, y + BAR_H);
  } else {
    const right = x + width;
    ctx.moveTo(right, y);
    ctx.lineTo(x + r, y);
    ctx.arcTo(x, y, x, y + r, r);
    ctx.lineTo(x, y + BAR_H - r);
    ctx.arcTo(x, y + BAR_H, x + r, y + BAR_H, r);
    ctx.lineTo(right, y + BAR_H);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  side: VersusSide,
  color: string,
  x: number,
  y: number,
  align: "left" | "right",
): void {
  const max = 210;
  ctx.textAlign = align;

  ctx.font = font(600, 15);
  ctx.fillStyle = INK.primary;
  const name = ellipsize(ctx, side.name, max);
  ctx.fillText(name, x, y + 15);
  const nameW = ctx.measureText(name).width;

  if (side.detail) {
    ctx.font = font(400, 11);
    ctx.fillStyle = INK.muted;
    ctx.fillText(ellipsize(ctx, side.detail, max), x, y + 30);
  }

  // Accent rule under the name, so each side's colour is declared before the
  // bars use it to mean identity.
  ctx.fillStyle = color;
  const ruleX = align === "left" ? x : x - nameW;
  roundRect(ctx, ruleX, y + 36, Math.max(24, nameW), 3, 1.5);
  ctx.fill();

  ctx.textAlign = "left";
}

export { SURFACE, alpha };
