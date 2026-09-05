/**
 * Ranked horizontal bars — the house form for "who leads this market".
 *
 * A ring cannot show a ranking, and past about six slices its labels collide.
 * This replaces the 15-slice doughnut /marketshare used to emit: one row per
 * entity, sorted, direct-labelled, with the bar carrying magnitude and the
 * right-hand columns carrying the exact values.
 */

import type { CanvasRenderingContext2D } from "canvas";
import { chromeHeight, drawEmptyState, ellipsize, renderCard, roundRect, type CardSpec, type Rect } from "./card.js";
import { font } from "./fonts.js";
import { AXIS, GEO, INK, SURFACE, TYPE, alpha } from "./theme.js";

export interface BarRow {
  /** Entity name, shown in the label column. */
  label: string;
  /** Magnitude driving the bar length. */
  value: number;
  /** Bar colour — the entity's own brand colour, or a fixed categorical slot. */
  color: string;
  /** Primary right-hand column, e.g. "58.88%". */
  primary: string;
  /** Optional secondary right-hand column, e.g. "$946.4M". */
  secondary?: string;
  /** Optional short muted tag after the name, e.g. "NatCorp". */
  tag?: string;
}

export interface BarChartOptions extends Omit<CardSpec, "height"> {
  rows: BarRow[];
  /** Width of the label column as a fraction of the plot. Clamped 0.2–0.45. */
  labelFraction?: number;
  /** Rank shown against the first row. Lets page 2 start at 16, not 1. */
  startRank?: number;
  emptyMessage?: string;
}

const ROW_H = 15;
const ROW_GAP = 7;
const BAR_H = 11;
const PAD = 14;

/** Compute the exact card height for a row count, so nothing is squeezed. */
export function barChartHeight(rowCount: number, spec: Pick<CardSpec, "subtitle">): number {
  const body = Math.max(1, rowCount) * (ROW_H + ROW_GAP) - ROW_GAP + PAD * 2;
  return Math.round(chromeHeight({ ...spec, footerLeft: " " }) + body);
}

export function renderBarChart(options: BarChartOptions): Buffer {
  const { rows, emptyMessage = "No data for this view." } = options;
  const width = options.width ?? 660;
  const height = barChartHeight(rows.length, options);

  return renderCard({ ...options, width, height }, (ctx, plot) => {
    if (rows.length === 0) {
      drawEmptyState(ctx, plot, emptyMessage);
      return;
    }
    drawRows(ctx, plot, rows, options.labelFraction ?? 0.34, options.startRank ?? 1);
  });
}

function drawRows(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  rows: BarRow[],
  labelFraction: number,
  startRank: number,
): void {
  const inner: Rect = { x: plot.x + PAD, y: plot.y + PAD, w: plot.w - PAD * 2, h: plot.h - PAD * 2 };

  // ── Column widths ─────────────────────────────────────────────────────────
  ctx.font = font(500, TYPE.value, "mono");
  const primaryW = Math.max(...rows.map((r) => ctx.measureText(r.primary).width));
  const hasSecondary = rows.some((r) => r.secondary);
  const secondaryW = hasSecondary
    ? Math.max(...rows.map((r) => (r.secondary ? ctx.measureText(r.secondary).width : 0)))
    : 0;

  ctx.font = font(400, TYPE.label, "mono");
  const rankW = ctx.measureText(String(startRank + rows.length - 1)).width + 8;

  const valueGap = 12;
  const valuesW = primaryW + (hasSecondary ? valueGap + secondaryW : 0);
  const labelW = Math.round(inner.w * Math.min(0.45, Math.max(0.2, labelFraction)));

  const labelX = inner.x + rankW;
  const trackX = labelX + labelW + 12;
  const trackW = Math.max(24, inner.x + inner.w - valuesW - valueGap - trackX);
  const primaryRight = inner.x + inner.w - (hasSecondary ? secondaryW + valueGap : 0);
  const secondaryRight = inner.x + inner.w;

  const max = Math.max(...rows.map((r) => Math.abs(r.value)), Number.EPSILON);

  rows.forEach((row, i) => {
    const top = inner.y + i * (ROW_H + ROW_GAP);
    const mid = top + ROW_H / 2;
    const textBaseline = mid + TYPE.label * 0.35;

    // Rank
    ctx.font = font(400, TYPE.label, "mono");
    ctx.fillStyle = INK.muted;
    ctx.textAlign = "left";
    ctx.fillText(String(startRank + i), inner.x, textBaseline);

    // Label (+ optional muted tag)
    ctx.font = font(500, TYPE.label);
    ctx.fillStyle = INK.primary;
    let nameW = labelW;
    if (row.tag) {
      ctx.font = font(400, TYPE.footer);
      const tagW = ctx.measureText(row.tag).width + 7;
      nameW = Math.max(24, labelW - tagW);
    }
    ctx.font = font(500, TYPE.label);
    const name = ellipsize(ctx, row.label, nameW);
    ctx.fillText(name, labelX, textBaseline);
    if (row.tag) {
      const nw = ctx.measureText(name).width;
      ctx.font = font(400, TYPE.footer);
      ctx.fillStyle = INK.muted;
      ctx.fillText(row.tag, labelX + nw + 7, textBaseline);
    }

    // Track — recessive, shows each bar against the full scale
    const barTop = mid - BAR_H / 2;
    ctx.fillStyle = AXIS.grid;
    roundRect(ctx, trackX, barTop, trackW, BAR_H, 3);
    ctx.fill();

    // Bar — square at the baseline, 4px rounded at the data end. A visible
    // stub for near-zero values, so "tiny" still reads as present, not absent.
    const w = Math.max(3, (Math.abs(row.value) / max) * trackW);
    ctx.fillStyle = row.color;
    barPath(ctx, trackX, barTop, w, BAR_H, 4);
    ctx.fill();

    // 2px surface ring keeps adjacent bars from merging. Skipped on stubs,
    // where a 2px inset would erase the mark it is meant to separate.
    if (w > 8) {
      ctx.strokeStyle = SURFACE.plot;
      ctx.lineWidth = 2;
      barPath(ctx, trackX, barTop, w, BAR_H, 4);
      ctx.stroke();
    }

    // Values — text wears ink tokens, the bar beside them carries identity
    ctx.textAlign = "right";
    ctx.font = font(500, TYPE.value, "mono");
    ctx.fillStyle = INK.primary;
    ctx.fillText(row.primary, primaryRight, textBaseline);
    if (row.secondary) {
      ctx.font = font(400, TYPE.value, "mono");
      ctx.fillStyle = INK.muted;
      ctx.fillText(row.secondary, secondaryRight, textBaseline);
    }
    ctx.textAlign = "left";
  });

  // Baseline the bars are anchored to
  ctx.strokeStyle = alpha(INK.muted, 0.25);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(trackX + 0.5, inner.y - 4);
  ctx.lineTo(trackX + 0.5, inner.y + rows.length * (ROW_H + ROW_GAP) - ROW_GAP + 4);
  ctx.stroke();
}

/** Bar path: flat at the baseline edge, rounded at the data end. */
function barPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w, h / 2);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

export { GEO };
