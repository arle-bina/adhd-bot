/**
 * Line / area charts — the house form for change over time.
 *
 * Deliberately single-axis. Two y-scales in one frame let any two unrelated
 * series be made to look correlated by choosing the scales, so a second measure
 * gets a second chart rather than a second axis.
 *
 * Candlesticks and a price+volume panel used to live here for /market. That
 * command has been retired: it called an endpoint that never existed, and no
 * route in the game exposes open/high/low/close or volume, so neither form had
 * a possible data source. They are in git history if one ever appears.
 */

import type { CanvasRenderingContext2D } from "canvas";
import { drawEmptyState, renderCard, roundRect, type CardSpec, type Rect } from "./card.js";
import { font } from "./fonts.js";
import { formatValue, niceScale, tickIndices, type ValueFormat } from "./format.js";
import { AXIS, INK, SERIES, STATUS, SURFACE, TYPE, alpha, seriesColor } from "./theme.js";

export interface TimeSeries {
  name: string;
  values: number[];
  /** Explicit colour. Defaults to the fixed categorical slot for its index. */
  color?: string;
}

export interface TimeSeriesOptions extends CardSpec {
  labels: string[];
  series: TimeSeries[];
  valueFormat?: ValueFormat;
  currencySymbol?: string;
  /** Fill under the line. Forced off for multi-series, where fills occlude. */
  fill?: boolean;
  /**
   * Colour a single series by its net direction over the window (green up, red
   * down). Only ever applied to one series, and always paired with a signed
   * change label so direction never rests on colour alone.
   */
  directional?: boolean;
  /** Draw an emphasised zero line — for change-vs-baseline charts. */
  zeroBaseline?: boolean;
  emptyMessage?: string;
}

const PAD = 14;
const X_AXIS_H = 20;
const LEGEND_H = 20;
const MAX_DIRECT_LABELS = 4;

export function renderTimeSeries(options: TimeSeriesOptions): Buffer {
  const series = options.series.filter((s) => s.values.some((v) => isFinite(v)));
  const width = options.width ?? 660;
  const height = options.height ?? 340;

  return renderCard({ ...options, width, height }, (ctx, plot) => {
    if (series.length === 0 || options.labels.length === 0) {
      drawEmptyState(ctx, plot, options.emptyMessage ?? "Not enough history to chart yet.");
      return;
    }
    drawSeries(ctx, plot, { ...options, series });
  });
}

function drawSeries(ctx: CanvasRenderingContext2D, plot: Rect, o: TimeSeriesOptions): void {
  const { labels, series } = o;
  const format = o.valueFormat ?? "number";
  const symbol = o.currencySymbol ?? "$";
  const multi = series.length > 1;
  const fill = (o.fill ?? !multi) && !multi;

  // ── Colours ───────────────────────────────────────────────────────────────
  const colors = series.map((s, i) => {
    if (s.color) return s.color;
    if (!multi && o.directional) {
      const vals = s.values.filter((v) => isFinite(v));
      const net = (vals.at(-1) ?? 0) - (vals[0] ?? 0);
      return net > 0 ? STATUS.good : net < 0 ? STATUS.critical : SERIES[0];
    }
    return seriesColor(i);
  });

  // ── Scale ─────────────────────────────────────────────────────────────────
  const flat = series.flatMap((s) => s.values).filter((v) => isFinite(v));
  let lo = Math.min(...flat);
  let hi = Math.max(...flat);
  if (o.zeroBaseline) {
    const span = Math.max(Math.abs(lo), Math.abs(hi));
    lo = -span;
    hi = span;
  }
  const scale = niceScale(lo, hi, 5);

  // ── Geometry ──────────────────────────────────────────────────────────────
  const legendH = multi ? LEGEND_H : 0;
  ctx.font = font(400, TYPE.axis, "mono");
  const yLabels: string[] = [];
  for (let v = scale.min; v <= scale.max + scale.step / 2; v += scale.step) {
    yLabels.push(formatValue(v, format, symbol));
  }
  const yAxisW = Math.max(...yLabels.map((l) => ctx.measureText(l).width)) + 10;

  // Room at the right for the end-of-line direct labels
  const directLabels = series.length <= MAX_DIRECT_LABELS;
  const endLabelW = directLabels
    ? Math.max(
        ...series.map((s) => {
          const last = [...s.values].reverse().find((v) => isFinite(v)) ?? 0;
          return ctx.measureText(formatValue(last, format, symbol)).width;
        }),
      ) + 14
    : 6;

  const area: Rect = {
    x: plot.x + PAD + yAxisW,
    y: plot.y + PAD + legendH,
    w: plot.w - PAD * 2 - yAxisW - endLabelW,
    h: plot.h - PAD * 2 - legendH - X_AXIS_H,
  };

  const yOf = (v: number) => area.y + area.h - ((v - scale.min) / (scale.max - scale.min || 1)) * area.h;
  const xOf = (i: number) => area.x + (labels.length === 1 ? area.w / 2 : (i / (labels.length - 1)) * area.w);

  // ── Grid + y axis (recessive) ─────────────────────────────────────────────
  ctx.font = font(400, TYPE.axis, "mono");
  ctx.textAlign = "right";
  let li = 0;
  for (let v = scale.min; v <= scale.max + scale.step / 2; v += scale.step, li++) {
    const y = yOf(v);
    const isZero = o.zeroBaseline && Math.abs(v) < scale.step / 1000;
    ctx.strokeStyle = isZero ? AXIS.baseline : AXIS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(area.x, Math.round(y) + 0.5);
    ctx.lineTo(area.x + area.w, Math.round(y) + 0.5);
    ctx.stroke();

    ctx.fillStyle = isZero ? INK.secondary : INK.muted;
    ctx.fillText(yLabels[li] ?? "", area.x - 8, y + TYPE.axis * 0.35);
  }
  ctx.textAlign = "left";

  // ── x axis ────────────────────────────────────────────────────────────────
  const xTicks = tickIndices(labels.length, Math.max(2, Math.min(8, Math.floor(area.w / 68))));
  ctx.font = font(400, TYPE.axis, "mono");
  ctx.fillStyle = INK.muted;
  const axisY = area.y + area.h + 14;
  for (const i of xTicks) {
    const x = xOf(i);
    ctx.textAlign = i === 0 ? "left" : i === labels.length - 1 ? "right" : "center";
    ctx.fillText(labels[i] ?? "", x, axisY);
  }
  ctx.textAlign = "left";

  // ── Series ────────────────────────────────────────────────────────────────
  series.forEach((s, si) => {
    const color = colors[si];
    const pts = s.values.map((v, i) => ({ x: xOf(i), y: yOf(v), ok: isFinite(v) })).filter((p) => p.ok);
    if (pts.length === 0) return;

    if (fill) {
      const grad = ctx.createLinearGradient(0, area.y, 0, area.y + area.h);
      grad.addColorStop(0, alpha(color, 0.28));
      grad.addColorStop(1, alpha(color, 0.0));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, area.y + area.h);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.lineTo(pts.at(-1)!.x, area.y + area.h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // Only the final point gets a marker — never a dot on every observation.
    const last = pts.at(-1)!;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = SURFACE.plot;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (directLabels) {
      const v = [...s.values].reverse().find((n) => isFinite(n)) ?? 0;
      ctx.font = font(500, TYPE.axis, "mono");
      ctx.fillStyle = INK.primary;
      ctx.textAlign = "left";
      ctx.fillText(formatValue(v, format, symbol), Math.min(last.x + 9, plot.x + plot.w - PAD - 4), last.y + TYPE.axis * 0.35);
    }
  });

  if (multi) drawInlineLegend(ctx, plot, series, colors);
}

/** Compact legend across the top of the plot. Always present for >= 2 series. */
function drawInlineLegend(
  ctx: CanvasRenderingContext2D,
  plot: Rect,
  series: TimeSeries[],
  colors: string[],
): void {
  const y = plot.y + PAD + 8;
  let x = plot.x + PAD;
  const maxX = plot.x + plot.w - PAD;

  ctx.font = font(500, TYPE.footer);
  for (let i = 0; i < series.length; i++) {
    const label = series[i].name;
    const w = ctx.measureText(label).width + 10 + 14;
    if (x + w > maxX) break;

    ctx.fillStyle = colors[i];
    roundRect(ctx, x, y - 6.5, 8, 8, 2);
    ctx.fill();

    ctx.fillStyle = INK.secondary;
    ctx.fillText(label, x + 12, y);
    x += w;
  }
}
