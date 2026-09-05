import { describe, it, expect } from "vitest";
import { buildColumns, renderWaterfall, type WaterfallStep } from "../../src/utils/viz/waterfall.js";

/** A representative income statement: revenue, four costs, two subtotals. */
const PL: WaterfallStep[] = [
  { label: "Revenue", delta: 1000 },
  { label: "Maintenance", delta: -300 },
  { label: "Growth", delta: -150 },
  { label: "Operating income", delta: 0, total: true },
  { label: "Bond interest", delta: -50 },
  { label: "Net income", delta: 0, total: true },
];

describe("buildColumns", () => {
  it("carries the running balance from step to step", () => {
    const cols = buildColumns(PL);
    expect(cols.map((c) => c.running)).toEqual([1000, 700, 550, 550, 500, 500]);
  });

  it("spans each step from where the previous one finished", () => {
    const cols = buildColumns(PL);
    // Maintenance drops 1000 -> 700, so its bar must occupy exactly that range.
    expect(cols[1].from).toBe(1000);
    expect(cols[1].to).toBe(700);
  });

  it("draws subtotals from the baseline, not as a step", () => {
    const cols = buildColumns(PL);
    const operating = cols[3];
    expect(operating.from).toBe(0);
    expect(operating.to).toBe(550);
  });

  it("ignores a subtotal's delta so it cannot corrupt the running balance", () => {
    const withJunk = buildColumns([
      { label: "Revenue", delta: 1000 },
      { label: "Subtotal", delta: 9999, total: true },
      { label: "Cost", delta: -100 },
    ]);
    expect(withJunk[1].to).toBe(1000);
    expect(withJunk[2].running).toBe(900);
  });

  it("closes below zero when costs exceed revenue", () => {
    const cols = buildColumns([
      { label: "Revenue", delta: 210 },
      { label: "Costs", delta: -270 },
      { label: "Net income", delta: 0, total: true },
    ]);
    expect(cols[2].running).toBe(-60);
    expect(cols[2].to).toBeLessThan(0);
  });

  it("returns nothing for no steps", () => {
    expect(buildColumns([])).toEqual([]);
  });
});

describe("renderWaterfall", () => {
  const format = (v: number) => `$${Math.round(v)}`;

  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  function expectPng(buf: Buffer) {
    expect(buf.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  }

  it("renders a profitable statement", () => {
    expectPng(renderWaterfall({ title: "P&L", steps: PL, format }));
  });

  it("renders a loss-making statement, where the close falls below the baseline", () => {
    expectPng(
      renderWaterfall({
        title: "P&L",
        steps: [
          { label: "Revenue", delta: 210 },
          { label: "Costs", delta: -270 },
          { label: "Net income", delta: 0, total: true },
        ],
        format,
      }),
    );
  });

  it("renders an empty state rather than throwing", () => {
    expectPng(renderWaterfall({ title: "P&L", steps: [], format }));
  });

  it("survives an all-zero statement, which would otherwise divide by zero", () => {
    expectPng(
      renderWaterfall({
        title: "P&L",
        steps: [
          { label: "Revenue", delta: 0 },
          { label: "Net income", delta: 0, total: true },
        ],
        format,
      }),
    );
  });

  it("survives labels far too long for their column", () => {
    expectPng(
      renderWaterfall({
        title: "P&L",
        steps: Array.from({ length: 12 }, (_, i) => ({
          label: `An extremely long cost line item number ${i}`,
          delta: -10,
        })),
        format,
      }),
    );
  });
});
