/**
 * Waterfall — the house form for "where the money went".
 *
 * A profit and loss statement is a running balance, not a set of independent
 * quantities. Ranked bars would say which cost is largest; a waterfall says how
 * revenue becomes income, which is the question an income statement is asked.
 * Each step starts where the last one finished, so the drops are the costs and
 * the final column is what survived.
 *
 * Steps are drawn in statement order and never re-sorted: reordering a
 * waterfall breaks the arithmetic it exists to show.
 */

import type { CanvasRenderingContext2D } from "canvas";
import { chromeHeight, drawEmptyState, ellipsize, renderCard, roundRect, type CardSpec, type Rect } from "./card.js";
import { font } from "./fonts.js";
import { niceScale } from "./format.js";
import { AXIS, INK, STATUS, SURFACE, alpha } from "./theme.js";

export interface WaterfallStep {
  label: string;
  /** Signed: positive adds to the running total, negative subtracts. */
  delta: number;
  /**
   * A subtotal column, drawn from the baseline rather than as a step. Its
   * `delta` is ignored and the running total is shown instead.
   */
  total?: boolean;
}

export interface WaterfallOptions extends Omit<CardSpec, "height"> {
  steps: WaterfallStep[];
  /** Formats every value on the chart. */
  format: (value: number) => string;
  emptyMessage?: string;
}

const PAD = 16;
const LABEL_H = 34;
const VALUE_H = 16;
const CONNECTOR = "rgba(232, 232, 238, 0.22)";

export function waterfallHeight(spec: Pick<CardSpec, "subtitle">): number {
  return Math.round(chromeHeight({ ...spec, footerLeft: " " }) + 210 + LABEL_H + VALUE_H + PAD * 2);
}

export function renderWaterfall(options: WaterfallOptions): Buffer {
  const width = options.width ?? 700;
  const height = waterfallHeight(options);

  return renderCard({ ...options, width, height }, (ctx, plot) => {
    if (options.steps.length === 0) {
      drawEmptyState(ctx, plot, options.emptyMessage ?? "No income statement for this period.");
      return;
    }
    draw(ctx, plot, options);
  });
}

interface Column {
  step: WaterfallStep;
  /** Bar spans [from, to] in value space. */
  from: number;
  to: number;
  running: number;
}

/** Walk the steps into columns, carrying the running balance. */
export function buildColumns(steps: WaterfallStep[]): Column[] {
  const columns: Column[] = [];
  let running = 0;

  for (const step of steps) {
    if (step.total) {
      columns.push({ step, from: 0, to: running, running });
      continue;
    }
    const from = running;
    running += step.delta;
    columns.push({ step, from, to: running, running });
  }
  return columns;
}

function draw(ctx: CanvasRenderingContext2D, plot: Rect, o: WaterfallOptions): void {
  const columns = buildColumns(o.steps);

  const area: Rect = {
    x: plot.x + PAD,
    y: plot.y + PAD + VALUE_H,
    w: plot.w - PAD * 2,
    h: plot.h - PAD * 2 - VALUE_H - LABEL_H,
  };

  const values = columns.flatMap((c) => [c.from, c.to]);
  const scale = niceScale(Math.min(0, ...values), Math.max(0, ...values), 4);
  const yOf = (v: number) =>
    area.y + area.h - ((v - scale.min) / (scale.max - scale.min || 1)) * area.h;

  // Zero line, because a waterfall is only readable against a baseline.
  const zeroY = yOf(0);
  ctx.strokeStyle = AXIS.baseline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(area.x, Math.round(zeroY) + 0.5);
  ctx.lineTo(area.x + area.w, Math.round(zeroY) + 0.5);
  ctx.stroke();

  const slot = area.w / columns.length;
  const barW = Math.max(6, Math.min(56, slot * 0.62));

  columns.forEach((col, i) => {
    const cx = area.x + slot * (i + 0.5);
    const top = Math.min(yOf(col.from), yOf(col.to));
    const h = Math.max(2, Math.abs(yOf(col.to) - yOf(col.from)));

    // Subtotals are neutral: they are a position, not a gain or a loss.
    const color = col.step.total
      ? INK.secondary
      : col.step.delta >= 0
        ? STATUS.good
        : STATUS.critical;

    ctx.fillStyle = col.step.total ? alpha(color, 0.55) : color;
    roundRect(ctx, cx - barW / 2, top, barW, h, 3);
    ctx.fill();

    // Connector to the next column, so the eye follows the running balance.
    const next = columns[i + 1];
    if (next && !next.step.total) {
      ctx.strokeStyle = CONNECTOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      const y = Math.round(yOf(col.to)) + 0.5;
      ctx.moveTo(cx + barW / 2, y);
      ctx.lineTo(area.x + slot * (i + 1.5) - barW / 2, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Value above the column for gains and subtotals, below for costs, so a
    // label never sits on top of the bar it describes.
    const display = o.format(col.step.total ? col.running : col.step.delta);
    ctx.font = font(600, 10.5, "mono");
    ctx.fillStyle = col.step.total ? INK.primary : INK.secondary;
    ctx.textAlign = "center";
    const labelY = col.step.delta >= 0 || col.step.total ? top - 5 : top + h + 12;
    ctx.fillText(display, cx, labelY);

    // Column name under the axis, wrapped to two lines where it must be.
    ctx.font = font(500, 9.5);
    ctx.fillStyle = INK.muted;
    const [line1, line2] = wrapTwo(ctx, col.step.label, slot - 6);
    ctx.fillText(line1, cx, area.y + area.h + 14);
    if (line2) ctx.fillText(line2, cx, area.y + area.h + 25);
    ctx.textAlign = "left";
  });

  // Ring the closing column — it is the answer the chart was asked for.
  const last = columns[columns.length - 1];
  if (last?.step.total) {
    const cx = area.x + slot * (columns.length - 0.5);
    const top = Math.min(yOf(last.from), yOf(last.to));
    const h = Math.max(2, Math.abs(yOf(last.to) - yOf(last.from)));
    ctx.strokeStyle = last.running >= 0 ? STATUS.good : STATUS.critical;
    ctx.lineWidth = 1.5;
    roundRect(ctx, cx - barW / 2 - 3, top - 3, barW + 6, h + 6, 5);
    ctx.stroke();
  }
}

/** Split a label across at most two centred lines, ellipsising the overflow. */
function wrapTwo(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): [string, string | null] {
  if (ctx.measureText(text).width <= maxWidth) return [text, null];

  const words = text.split(" ");
  if (words.length === 1) return [ellipsize(ctx, text, maxWidth), null];

  for (let split = words.length - 1; split > 0; split--) {
    const first = words.slice(0, split).join(" ");
    if (ctx.measureText(first).width <= maxWidth) {
      return [first, ellipsize(ctx, words.slice(split).join(" "), maxWidth)];
    }
  }
  return [ellipsize(ctx, words[0], maxWidth), ellipsize(ctx, words.slice(1).join(" "), maxWidth)];
}

export { SURFACE };
