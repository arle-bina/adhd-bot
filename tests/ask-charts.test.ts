import { describe, expect, it } from "vitest";
import { parseAskChart, renderAskChartPng, splitMermaidList } from "../src/utils/ask-charts.js";

const PNG = Buffer.from([137, 80, 78, 71]);

describe("Ask chart parsing", () => {
  it("splits Mermaid lists without breaking quoted labels", () => {
    expect(splitMermaidList('"New York, NY", Ohio, \'Texas\'')).toEqual(["New York, NY", "Ohio", "Texas"]);
  });

  it("parses an xychart with quoted title, axis label and two series", () => {
    const chart = parseAskChart([
      "xychart-beta",
      '  title "Unemployment by turn"',
      "  x-axis [t1, t2, t3]",
      '  y-axis "Percent" 0 --> 10',
      "  line [4.1, 4.5, 5.0]",
      "  bar [3, 3.5, 4]",
    ].join("\n"));
    expect(chart).toEqual({
      kind: "xy",
      title: "Unemployment by turn",
      labels: ["t1", "t2", "t3"],
      yLabel: "Percent",
      series: [{ type: "line", values: [4.1, 4.5, 5] }, { type: "bar", values: [3, 3.5, 4] }],
    });
  });

  it("rejects a series whose length disagrees with its axis", () => {
    expect(parseAskChart("xychart-beta\n x-axis [a, b, c]\n bar [1, 2]")).toBeNull();
  });

  it("parses pie charts with header titles and drops non-positive slices", () => {
    expect(parseAskChart('pie title Seats\n "Labour" : 326\n "Conservative" : 210\n "Empty" : 0')).toEqual({
      kind: "pie", title: "Seats", slices: [{ label: "Labour", value: 326 }, { label: "Conservative", value: 210 }],
    });
  });

  it("returns null for dialects Discord cannot show", () => {
    expect(parseAskChart("sequenceDiagram\n A->>B: hi")).toBeNull();
    expect(parseAskChart("")).toBeNull();
  });

  it("renders bar, trend and pie charts to PNG", () => {
    for (const source of [
      'xychart-beta\n title "GDP"\n x-axis [US, UK, FR]\n bar [21.4, 2.8, 2.6]',
      'xychart-beta\n title "Trend"\n x-axis [1, 2, 3]\n line [1, 2, 3]',
      'pie title Seats\n "A" : 3\n "B" : 2',
    ]) {
      expect(renderAskChartPng(source)?.subarray(0, 4)).toEqual(PNG);
    }
  });
});
