/**
 * Composition bar — one stacked bar against a threshold.
 *
 * The house form for "who is on which side, and does it clear the line": a
 * governing coalition against a majority, a bill's ayes against cloture, a
 * referendum's yes against the quorum. A pie answers "what share"; this answers
 * "is it enough", which is the question these views are actually asked.
 *
 * The threshold marker is the point of the chart, so it is drawn on top of the
 * segments and labelled with its own number.
 */

import type { CanvasRenderingContext2D } from "canvas";
import { chromeHeight, drawEmptyState, ellipsize, renderCard, roundRect, type CardSpec, type Rect } from "./card.js";
import { font } from "./fonts.js";
import { AXIS, INK, STATUS, SURFACE, TYPE, alpha, ensureVisible } from "./theme.js";

export interface CompositionSegment {
  label: string;
  value: number;
  color: string;
  /** Marks this segment as part of the bloc measured against the threshold. */
  supporting?: boolean;
}

export interface CompositionOptions extends Omit<CardSpec, "height"> {
  segments: CompositionSegment[];
  /** Denominator. Any shortfall renders as an explicit remainder segment. */
  total: number;
  threshold?: number;
  thresholdLabel?: string;
  /** Unit shown beside counts, e.g. "seats". */
  unit?: string;
  remainderLabel?: string;
  emptyMessage?: string;
}

const PAD = 18;
const BAR_H = 34;
const LEGEND_ROW_H = 18;
const LEGEND_COLS = 2;
const REMAINDER = "#33333f";

export function compositionHeight(segmentCount: number, spec: Pick<CardSpec, "subtitle">): number {
  const legendRows = Math.ceil(Math.max(1, segmentCount) / LEGEND_COLS);
  return Math.round(chromeHeight({ ...spec, footerLeft: " " }) + 78 + BAR_H + legendRows * LEGEND_ROW_H + PAD * 2);
}

export function renderComposition(options: CompositionOptions): Buffer {
  const segments = options.segments.filter((s) => s.value > 0);
  const supporting = segments.reduce((s, x) => s + (x.supporting === false ? 0 : x.value), 0);
  const drawn = segments.reduce((s, x) => s + x.value, 0);
  const total = Math.max(options.total, drawn);
  const remainder = Math.max(0, total - drawn);

  const all: CompositionSegment[] = remainder
    ? [...segments, { label: options.remainderLabel ?? "Other", value: remainder, color: REMAINDER, supporting: false }]
    : segments;

  const width = options.width ?? 660;
  const height = compositionHeight(all.length, options);

  return renderCard({ ...options, width, height }, (ctx, plot) => {
    if (all.length === 0 || total <= 0) {
      drawEmptyState(ctx, plot, options.emptyMessage ?? "No composition data.");
      return;
    }
    draw(ctx, plot, all, total, supporting, options);
  });
}

function draw(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  segments: CompositionSegment[],
  total: number,
  supporting: number,
  o: CompositionOptions,
): void {
  const x0 = plot.x + PAD;
  const w = plot.w - PAD * 2;
  const unit = o.unit ?? "";
  const threshold = o.threshold;
  const clears = threshold == null || supporting >= threshold;

  // ── Hero: the bloc against the line ───────────────────────────────────────
  ctx.font = font(700, 30, "mono");
  ctx.fillStyle = INK.primary;
  ctx.fillText(String(supporting), x0, plot.y + PAD + 26);
  const heroW = ctx.measureText(String(supporting)).width;

  ctx.font = font(500, TYPE.footer, "mono");
  ctx.fillStyle = INK.muted;
  ctx.fillText(`of ${total}${unit ? ` ${unit}` : ""}`, x0 + heroW + 9, plot.y + PAD + 26);

  if (threshold != null) {
    const verdict = clears ? "CLEARS" : `${threshold - supporting} SHORT`;
    const accent = clears ? STATUS.good : STATUS.critical;
    ctx.font = font(600, 10, "mono");
    const vw = ctx.measureText(verdict).width;
    ctx.fillStyle = alpha(accent, 0.2);
    roundRect(ctx, plot.x + plot.w - PAD - vw - 16, plot.y + PAD + 10, vw + 16, 18, 9);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.fillText(verdict, plot.x + plot.w - PAD - vw / 2 - 8, plot.y + PAD + 23);
    ctx.textAlign = "left";
  }

  // ── The bar ───────────────────────────────────────────────────────────────
  const barY = plot.y + PAD + 46;

  ctx.fillStyle = AXIS.grid;
  roundRect(ctx, x0, barY, w, BAR_H, 6);
  ctx.fill();

  ctx.save();
  roundRect(ctx, x0, barY, w, BAR_H, 6);
  ctx.clip();

  let x = x0;
  for (const seg of segments) {
    const segW = (seg.value / total) * w;
    ctx.fillStyle = seg.color === REMAINDER ? REMAINDER : ensureVisible(seg.color);
    ctx.fillRect(x, barY, segW, BAR_H);

    // 2px surface gap so adjacent segments never read as one block
    ctx.fillStyle = SURFACE.plot;
    ctx.fillRect(x + segW - 1, barY, 2, BAR_H);

    // Label inside the segment when it is wide enough to hold one
    if (segW > 46) {
      ctx.font = font(600, 11, "mono");
      const label = String(seg.value);
      const lw = ctx.measureText(label).width;
      if (lw + 12 < segW) {
        ctx.fillStyle = INK.onSeries;
        ctx.fillText(label, x + segW / 2 - lw / 2, barY + BAR_H / 2 + 4);
      }
    }
    x += segW;
  }
  ctx.restore();

  // ── Threshold, drawn over the segments because it is the whole point ──────
  if (threshold != null && threshold > 0 && threshold <= total) {
    const tx = x0 + (threshold / total) * w;
    ctx.strokeStyle = INK.primary;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.round(tx) + 0.5, barY - 7);
    ctx.lineTo(Math.round(tx) + 0.5, barY + BAR_H + 7);
    ctx.stroke();

    const label = `${o.thresholdLabel ?? "Needed"} ${threshold}`;
    ctx.font = font(600, 9.5, "mono");
    const lw = ctx.measureText(label).width;
    // Flip the label inboard when the marker sits near the right edge.
    const flip = tx + lw + 14 > x0 + w;
    ctx.fillStyle = INK.secondary;
    ctx.fillText(label, flip ? tx - lw - 7 : tx + 7, barY + BAR_H + 19);
  }

  drawLegend(ctx, plot, segments, total, unit);
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  segments: CompositionSegment[],
  total: number,
  unit: string,
): void {
  const legendRows = Math.ceil(segments.length / LEGEND_COLS);
  const x0 = plot.x + PAD;
  const colW = (plot.w - PAD * 2) / LEGEND_COLS;
  const y0 = plot.y + plot.h - PAD - legendRows * LEGEND_ROW_H + LEGEND_ROW_H * 0.72;

  segments.forEach((seg, i) => {
    const x = x0 + (i % LEGEND_COLS) * colW;
    const y = y0 + Math.floor(i / LEGEND_COLS) * LEGEND_ROW_H;

    ctx.fillStyle = seg.color === REMAINDER ? REMAINDER : ensureVisible(seg.color);
    roundRect(ctx, x, y - 7.5, 9, 9, 2.5);
    ctx.fill();

    const share = total > 0 ? `${((seg.value / total) * 100).toFixed(1)}%` : "";
    const meta = `${seg.value}${unit ? ` ${unit}` : ""} · ${share}`;
    ctx.font = font(500, TYPE.footer, "mono");
    const metaW = ctx.measureText(meta).width;

    ctx.font = font(500, TYPE.label);
    ctx.fillStyle = INK.primary;
    const name = ellipsize(ctx, seg.label, colW - 24 - metaW - 12);
    ctx.fillText(name, x + 15, y);
    const nameW = ctx.measureText(name).width;

    ctx.font = font(500, TYPE.footer, "mono");
    ctx.fillStyle = INK.muted;
    ctx.fillText(meta, x + 15 + nameW + 8, y);
  });
}
