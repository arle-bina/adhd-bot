import { describe, expect, it, vi } from "vitest";
import { extractAskVisualizations, renderMermaidPng } from "../src/utils/ask-visualizations.js";

describe("Ask visualizations", () => {
  it("extracts one Mermaid block and keeps the surrounding answer", () => {
    const result = extractAskVisualizations("Before\n\n```mermaid\nflowchart TD\n A --> B\n```\n\nAfter");
    expect(result.text).toBe("Before\n\nAfter");
    expect(result.visualizations).toEqual([{ source: "flowchart TD\n A --> B", index: 1 }]);
  });

  it("leaves additional diagrams in the answer after the one-image cap", () => {
    const result = extractAskVisualizations("```mermaid\nA-->B\n```\n```mermaid\nC-->D\n```");
    expect(result.visualizations).toHaveLength(1);
    expect(result.text).toContain("C-->D");
  });

  it("downloads a rendered PNG from the bounded Mermaid image request", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toMatch(/^https:\/\/mermaid\.ink\/img\/base64:/);
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } });
    });
    await expect(renderMermaidPng("flowchart TD\nA-->B", fetchMock as typeof fetch)).resolves.toEqual(Buffer.from([1, 2, 3]));
  });
});
