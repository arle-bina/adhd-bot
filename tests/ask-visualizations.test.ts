import { describe, expect, it, vi } from "vitest";
import {
  extractAskVisualizations, parsedFromSpec, renderAskChartRemote, renderAskMapPng, renderAskVisualization,
  renderAskVisualizationPng, truncateDiscordCodeBlocks,
} from "../src/utils/ask-visualizations.js";

describe("Ask visualizations", () => {
  it("extracts one Mermaid block and keeps the surrounding answer", () => {
    const result = extractAskVisualizations("Before\n\n```mermaid\nflowchart TD\n A --> B\n```\n\nAfter");
    expect(result.text).toBe("Before\n\nAfter");
    expect(result.visualizations).toEqual([{ kind: "mermaid", source: "flowchart TD\n A --> B", index: 1 }]);
  });

  it("extracts a native AHD map block in answer order", () => {
    const source = JSON.stringify({ scope: "country", country: "IT", regions: [{ id: "IT_LAZ", value: 1 }] });
    const result = extractAskVisualizations(`Before\n\n\`\`\`ahd-map\n${source}\n\`\`\`\n\nAfter`);
    expect(result.text).toBe("Before\n\nAfter");
    expect(result.visualizations).toEqual([{ kind: "map", source, index: 1 }]);
  });

  it("leaves additional diagrams in the answer after the one-image cap", () => {
    const result = extractAskVisualizations("```mermaid\nA-->B\n```\n```mermaid\nC-->D\n```");
    expect(result.visualizations).toHaveLength(1);
    expect(result.text).toContain("C-->D");
  });

  it("preserves a multiline canonical map for extraction instead of truncating its JSON", () => {
    const source = JSON.stringify({
      scope: "country", country: "US", metric: "candidate_roster",
      regions: Array.from({ length: 12 }, (_unused, index) => ({ id: `S${index}`, value: 1 })),
    }, null, 2);
    const answer = `Before\n\n\`\`\`ahd-map\n${source}\n\`\`\`\n\nAfter`;

    const formatted = truncateDiscordCodeBlocks(answer, 30);
    const result = extractAskVisualizations(formatted);

    expect(formatted).toContain(source);
    expect(JSON.parse(result.visualizations[0].source)).toMatchObject({ metric: "candidate_roster" });
    expect(result.text).toBe("Before\n\nAfter");
  });

  it("renders supported charts in-process and never calls out for other diagrams", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const chart = renderAskVisualizationPng('xychart-beta\n  title "GDP"\n  x-axis ["US", "UK"]\n  bar [21.4, 2.8]');
    expect(chart?.subarray(0, 4)).toEqual(Buffer.from([137, 80, 78, 71]));
    expect(renderAskVisualizationPng("flowchart TD\nA-->B")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("posts a map spec to the authenticated Ask PNG renderer", async () => {
    const source = JSON.stringify({ scope: "world", regions: [{ id: "US", value: 1 }] });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://ask.example/api/map/render?format=png");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(source);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
    });
    await expect(renderAskMapPng(source, fetchMock as typeof fetch, "https://ask.example", "secret"))
      .resolves.toEqual(Buffer.from([137, 80, 78, 71]));
  });

  it("extracts an ask-chart block as a chart and never truncates its JSON", () => {
    const spec = JSON.stringify({ title: "Egg Media", labels: Array.from({ length: 40 }, (_u, i) => `T${i}`), series: [{ values: Array.from({ length: 40 }, (_u, i) => i) }] }, null, 2);
    const answer = `\`\`\`ask-chart\n${spec}\n\`\`\`\n\nRevenue is flat.`;
    const result = extractAskVisualizations(truncateDiscordCodeBlocks(answer, 30));
    expect(result.visualizations).toEqual([{ kind: "chart", source: spec, index: 1 }]);
    expect(result.text).toBe("Revenue is flat.");
  });

  it("draws charts with Ask's renderer so Discord matches the web", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://ask.example/api/chart/render?format=png");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
      expect(JSON.parse(String(init?.body))).toEqual({ mermaid: "xychart-beta\n bar [1, 2]", width: 640 });
      return new Response(png, { status: 200, headers: { "content-type": "image/png" } });
    });
    await expect(renderAskChartRemote({ mermaid: "xychart-beta\n bar [1, 2]" }, fetchMock as typeof fetch, "https://ask.example", "secret"))
      .resolves.toEqual(Buffer.from(png));
  });

  it("falls back to the bot's own drawing when Ask is unreachable, and skips flowcharts", async () => {
    const down = vi.fn(async () => { throw new Error("offline"); });
    const spec = JSON.stringify({ title: "Revenue", kind: "bar", labels: ["A", "B"], series: [{ values: [3, 9] }] });
    const chart = await renderAskVisualization({ kind: "chart", source: spec, index: 1 }, down as unknown as typeof fetch);
    expect(chart?.subarray(0, 4)).toEqual(Buffer.from([137, 80, 78, 71]));
    const mermaid = await renderAskVisualization({ kind: "mermaid", source: 'xychart-beta\n title "GDP"\n x-axis ["US", "UK"]\n bar [21.4, 2.8]', index: 1 }, down as unknown as typeof fetch);
    expect(mermaid?.subarray(0, 4)).toEqual(Buffer.from([137, 80, 78, 71]));
    expect(await renderAskVisualization({ kind: "mermaid", source: "flowchart TD\nA-->B", index: 1 }, down as unknown as typeof fetch)).toBeNull();
    expect(down).toHaveBeenCalledTimes(2);
  });

  it("reads shares and turn series from an ask-chart spec for the fallback", () => {
    expect(parsedFromSpec(JSON.stringify({ partOfWhole: true, labels: ["Lab", "Con"], series: [{ values: [312, 241] }] }))?.kind).toBe("pie");
    const line = parsedFromSpec(JSON.stringify({ kind: "multiples", labels: ["T1", "T2"], series: [{ values: [1, 2] }, { values: [20, 21] }] }));
    expect(line).toMatchObject({ kind: "xy", series: [{ type: "line" }, { type: "line" }] });
    expect(parsedFromSpec("not json")).toBeNull();
  });
});
