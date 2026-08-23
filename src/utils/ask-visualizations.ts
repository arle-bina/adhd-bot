export interface AskVisualization {
  kind: "mermaid" | "map";
  source: string;
  index: number;
}

export interface ExtractedAskVisualizations {
  text: string;
  visualizations: AskVisualization[];
}

const VISUALIZATION_BLOCK = /```(mermaid|mmd|ahd-map)\s*\n([\s\S]*?)```/gi;

export function extractAskVisualizations(answer: string, limit = 1): ExtractedAskVisualizations {
  const visualizations: AskVisualization[] = [];
  const text = answer.replace(VISUALIZATION_BLOCK, (block, language: string, source: string) => {
    const clean = source.trim();
    if (!clean || visualizations.length >= limit) return block;
    visualizations.push({
      kind: language.toLowerCase() === "ahd-map" ? "map" : "mermaid",
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

export async function renderMermaidPng(source: string, fetchImpl: FetchLike = fetch): Promise<Buffer> {
  const state = {
    code: source.slice(0, 6000),
    mermaid: { theme: "dark" },
    autoSync: true,
    updateDiagram: true,
  };
  const encoded = `base64:${Buffer.from(JSON.stringify(state)).toString("base64url")}`;
  const response = await fetchImpl(
    `https://mermaid.ink/img/${encoded}?type=png&bgColor=2f3136`,
    { signal: AbortSignal.timeout(20_000) },
  );
  if (!response.ok) throw new Error(`Mermaid renderer returned ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) throw new Error("Mermaid renderer returned a non-image response");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("Mermaid renderer returned an invalid image");
  return bytes;
}
