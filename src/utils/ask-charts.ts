/**
 * Ask chart rendering, in-process.
 *
 * Ask answers carry charts as Mermaid source. Discord cannot render Mermaid,
 * and posting the source to a third-party renderer sends game data off-box.
 * The Ask prompt only asks models for two chart dialects, `xychart-beta` and
 * `pie`, so those are parsed here and drawn with the bot's own chart house
 * style. Every other Mermaid dialect (flowcharts, sequences) returns null and
 * the caller points the player at the web view instead.
 */

import {
  renderBarChart,
  renderComposition,
  renderTimeSeries,
  seriesColor,
  type BarRow,
  type TimeSeries,
} from "./viz/index.js";

export interface ParsedXyChart {
  kind: "xy";
  title: string;
  labels: string[];
  yLabel: string;
  series: Array<{ type: "bar" | "line"; values: number[] }>;
}

export interface ParsedPieChart {
  kind: "pie";
  title: string;
  slices: Array<{ label: string; value: number }>;
}

export type ParsedAskChart = ParsedXyChart | ParsedPieChart;

const MAX_POINTS = 40;
const MAX_SLICES = 12;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && /^(["']).*\1$/.test(trimmed)) return trimmed.slice(1, -1);
  return trimmed;
}

/** Split a Mermaid list body on commas that are not inside quotes. */
export function splitMermaidList(body: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const char of body) {
    if (quote) {
      if (char === quote) quote = null;
      current += char;
    } else if (char === "\"" || char === "'") {
      quote = char;
      current += char;
    } else if (char === ",") {
      items.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) items.push(current);
  return items.map(unquote).filter(item => item.length > 0);
}

function bracketBody(line: string): string | null {
  const match = /\[([\s\S]*)\]/.exec(line);
  return match ? match[1] : null;
}

function numberList(line: string): number[] | null {
  const body = bracketBody(line);
  if (body === null) return null;
  const values = splitMermaidList(body).map(item => Number(item.replace(/[_\s]/g, "")));
  return values.length && values.every(Number.isFinite) ? values : null;
}

function parseXy(lines: string[]): ParsedXyChart | null {
  let title = "";
  let labels: string[] = [];
  let yLabel = "";
  const series: ParsedXyChart["series"] = [];
  for (const line of lines) {
    if (/^title\s/i.test(line)) title = unquote(line.slice(5));
    else if (/^x-axis\b/i.test(line)) {
      const body = bracketBody(line);
      if (body !== null) labels = splitMermaidList(body);
    } else if (/^y-axis\b/i.test(line)) {
      const quoted = /^y-axis\s+("[^"]*"|'[^']*')/i.exec(line);
      if (quoted) yLabel = unquote(quoted[1]);
    } else if (/^(bar|line)\b/i.test(line)) {
      const values = numberList(line);
      if (values) series.push({ type: line.toLowerCase().startsWith("line") ? "line" : "bar", values });
    }
  }
  if (!series.length) return null;
  const length = Math.min(MAX_POINTS, Math.max(...series.map(s => s.values.length)));
  if (!labels.length) labels = Array.from({ length }, (_unused, i) => String(i + 1));
  if (labels.length > MAX_POINTS) labels = labels.slice(0, MAX_POINTS);
  // A series whose length disagrees with the axis is a malformed chart, and
  // drawing it would put values against the wrong labels.
  if (series.some(s => s.values.length !== labels.length)) return null;
  return { kind: "xy", title: title || "Chart", labels, yLabel, series };
}

function parsePie(lines: string[], header: string): ParsedPieChart | null {
  let title = /^pie\b.*?\btitle\s+(.+)$/i.exec(header)?.[1]?.trim() ?? "";
  const slices: ParsedPieChart["slices"] = [];
  for (const line of lines) {
    if (/^title\s/i.test(line)) {
      title = unquote(line.slice(5));
      continue;
    }
    const match = /^("[^"]+"|'[^']+'|[^:]+?)\s*:\s*(-?[\d.,_]+)\s*$/.exec(line);
    if (!match) continue;
    const value = Number(match[2].replace(/[,_]/g, ""));
    if (Number.isFinite(value) && value > 0) slices.push({ label: unquote(match[1]), value });
  }
  if (!slices.length) return null;
  return { kind: "pie", title: unquote(title) || "Breakdown", slices: slices.slice(0, MAX_SLICES) };
}

/** Parse the two chart dialects Ask emits. Anything else is null. */
export function parseAskChart(source: string): ParsedAskChart | null {
  const lines = String(source || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("%%"));
  if (!lines.length) return null;
  const header = lines[0];
  if (/^xychart(-beta)?\b/i.test(header)) return parseXy(lines.slice(1));
  if (/^pie\b/i.test(header)) return parsePie(lines.slice(1), header);
  return null;
}

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(value / 1e3).toFixed(1)}K`;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

const FOOTER = "Generated by Ask";
const SEQUENTIAL_LABEL = /^(?:t(?:urn)?\s*\d+|\d{4}(?:-\d{2})?|q[1-4](?:\s+\d{4})?|-?\d+(?:\.\d+)?|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i;

/** Render a parsed chart to PNG. */
export function renderParsedAskChart(chart: ParsedAskChart): Buffer {
  if (chart.kind === "pie") {
    const total = chart.slices.reduce((sum, slice) => sum + slice.value, 0);
    return renderComposition({
      title: chart.title,
      footerLeft: FOOTER,
      total,
      segments: chart.slices.map((slice, i) => ({ label: slice.label, value: slice.value, color: seriesColor(i) })),
    });
  }

  const all = chart.series.flatMap(s => s.values);
  const fractional = all.some(v => !Number.isInteger(v)) && Math.max(...all.map(Math.abs)) < 1e3;
  // Turns, years, months and plain numbers are an ordered axis: a trend, not
  // a ranking. Categorical single-bar charts read best as sorted bars.
  const sequential = chart.labels.every(label => SEQUENTIAL_LABEL.test(label.trim()));
  if (chart.series.length === 1 && chart.series[0].type === "bar" && !sequential) {
    const values = chart.series[0].values;
    const rows: BarRow[] = chart.labels
      .map((label, i) => ({ label, value: values[i], color: seriesColor(0), primary: compact(values[i]) }))
      .sort((a, b) => b.value - a.value);
    return renderBarChart({ title: chart.title, subtitle: chart.yLabel || undefined, footerLeft: FOOTER, rows });
  }

  const series: TimeSeries[] = chart.series.map((s, i) => ({
    name: chart.series.length > 1 ? `${s.type === "line" ? "Line" : "Bar"} ${i + 1}` : chart.yLabel || chart.title,
    values: s.values,
  }));
  return renderTimeSeries({
    title: chart.title,
    subtitle: chart.yLabel || undefined,
    footerLeft: FOOTER,
    labels: chart.labels,
    series,
    valueFormat: fractional ? "decimal" : "number",
  });
}

/** Parse and render; null means this diagram has no Discord form. */
export function renderAskChartPng(source: string): Buffer | null {
  const chart = parseAskChart(source);
  return chart ? renderParsedAskChart(chart) : null;
}
