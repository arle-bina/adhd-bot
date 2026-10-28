import { renderAskChartPng, renderParsedAskChart, type ParsedAskChart } from "./ask-charts.js";

export interface AskVisualization {
  /** chart = an Ask ```ask-chart spec; mermaid = model-written Mermaid. */
  kind: "mermaid" | "map" | "chart";
  source: string;
  index: number;
}

export interface ExtractedAskVisualizations {
  text: string;
  visualizations: AskVisualization[];
}

const VISUALIZATION_BLOCK = /```(mermaid|mmd|ahd-map|ask-chart)\s*\n([\s\S]*?)```/gi;

/**
 * Discord answers cap ordinary code snippets, but an AHD map fence is a
 * machine-readable attachment payload. Truncating it before extraction turns
 * otherwise valid live-map JSON into an invalid map specification.
 */
export function truncateDiscordCodeBlocks(text: string, maxLines = 30): string {
  return text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language: string | undefined, code: string) => {
    if (language?.toLowerCase() === "ahd-map" || language?.toLowerCase() === "ask-chart") return match;
    const lines = code.split("\n");
    if (lines.length <= maxLines) return match;
    const kept = lines.slice(0, maxLines).join("\n");
    return `\`\`\`${language || ""}\n${kept}\n... (${lines.length - maxLines} more lines, see ops dashboard)\n\`\`\``;
  });
}

export function extractAskVisualizations(answer: string, limit = 1): ExtractedAskVisualizations {
  const visualizations: AskVisualization[] = [];
  const text = answer.replace(VISUALIZATION_BLOCK, (block, language: string, source: string) => {
    const clean = source.trim();
    if (!clean || visualizations.length >= limit) return block;
    visualizations.push({
      kind: language.toLowerCase() === "ahd-map" ? "map" : language.toLowerCase() === "ask-chart" ? "chart" : "mermaid",
      source: clean.slice(0, 60_000),
      index: visualizations.length + 1,
    });
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();
  return { text, visualizations };
}

export async function renderAskMapPng(
  source: string,
  fetchImpl: FetchLike = fetch,
  endpoint = process.env.ASK_SITE_URL || "https://ask.lakesidegames.net",
  secret = process.env.ASK_SECRET || process.env.ASK_API_SECRET || "",
): Promise<Buffer> {
  JSON.parse(source);
  const response = await fetchImpl(`${endpoint.replace(/\/$/, "")}/api/map/render?format=png`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: source,
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`Ask map renderer returned ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/png")) throw new Error("Ask map renderer returned a non-PNG response");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("Ask map renderer returned an invalid image");
  return bytes;
}

type FetchLike = typeof fetch;

/**
 * Render a Mermaid visualization in-process. Returns null for dialects that
 * have no Discord form; no diagram source ever leaves the bot.
 */
export function renderAskVisualizationPng(source: string): Buffer | null {
  return renderAskChartPng(source);
}

const CHART_MERMAID = /^\s*(?:%%[^\n]*\n\s*)*(?:xychart(?:-beta)?|pie)\b/i;

/**
 * Ask's own chart renderer, so a chart in Discord is the same Lakeside card
 * as on the web: game header, compact numbers, the right form for the data.
 * `body` is { mermaid } for a model-written chart or { source } for an
 * ```ask-chart spec.
 */
export async function renderAskChartRemote(
  body: { mermaid?: string; source?: string },
  fetchImpl: FetchLike = fetch,
  endpoint = process.env.ASK_SITE_URL || "https://ask.lakesidegames.net",
  secret = process.env.ASK_SECRET || process.env.ASK_API_SECRET || "",
): Promise<Buffer> {
  const response = await fetchImpl(`${endpoint.replace(/\/$/, "")}/api/chart/render?format=png`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ ...body, width: 640 }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Ask chart renderer returned ${response.status}`);
  if (!(response.headers.get("content-type") || "").startsWith("image/png")) throw new Error("Ask chart renderer returned a non-PNG response");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("Ask chart renderer returned an invalid image");
  return bytes;
}

interface AskChartSpec {
  title?: string;
  labels?: unknown[];
  partOfWhole?: boolean;
  kind?: string;
  series?: Array<{ name?: string; values?: unknown[] }>;
}

/** The bot's own drawing of an ask-chart spec, used only when Ask is unreachable. */
export function parsedFromSpec(source: string): ParsedAskChart | null {
  let spec: AskChartSpec;
  try { spec = JSON.parse(source) as AskChartSpec; } catch { return null; }
  const labels = (spec.labels || []).map(label => String(label));
  const series = (spec.series || []).map(s => ({ values: (s.values || []).map(Number) }))
    .filter(s => s.values.length === labels.length && s.values.every(Number.isFinite));
  if (!labels.length || !series.length) return null;
  if (spec.partOfWhole || spec.kind === "stacked") {
    return { kind: "pie", title: spec.title || "Breakdown", slices: labels.map((label, i) => ({ label, value: series[0].values[i] })).filter(s => s.value > 0) };
  }
  const time = spec.kind === "line" || spec.kind === "multiples";
  return { kind: "xy", title: spec.title || "Chart", labels, yLabel: "", series: series.map(s => ({ type: time ? "line" : "bar", values: s.values })) };
}

/**
 * Render any Ask visualization to a PNG. Maps and charts come from Ask's
 * renderers; if Ask cannot be reached, charts fall back to the bot's own
 * drawing. Null means the diagram has no Discord form (flowcharts).
 */
export async function renderAskVisualization(visualization: AskVisualization, fetchImpl: FetchLike = fetch): Promise<Buffer | null> {
  if (visualization.kind === "map") return renderAskMapPng(visualization.source, fetchImpl);
  if (visualization.kind === "chart") {
    try { return await renderAskChartRemote({ source: visualization.source }, fetchImpl); } catch {
      const parsed = parsedFromSpec(visualization.source);
      return parsed ? renderParsedAskChart(parsed) : null;
    }
  }
  if (!CHART_MERMAID.test(visualization.source)) return null;
  try { return await renderAskChartRemote({ mermaid: visualization.source }, fetchImpl); } catch {
    return renderAskChartPng(visualization.source);
  }
}
