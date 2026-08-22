export interface AskVisualization {
  source: string;
  index: number;
}

export interface ExtractedAskVisualizations {
  text: string;
  visualizations: AskVisualization[];
}

const MERMAID_BLOCK = /```(?:mermaid|mmd)\s*\n([\s\S]*?)```/gi;

export function extractAskVisualizations(answer: string, limit = 1): ExtractedAskVisualizations {
  const visualizations: AskVisualization[] = [];
  const text = answer.replace(MERMAID_BLOCK, (block, source: string) => {
    const clean = source.trim();
    if (!clean || visualizations.length >= limit) return block;
    visualizations.push({ source: clean.slice(0, 6000), index: visualizations.length + 1 });
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();
  return { text, visualizations };
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
