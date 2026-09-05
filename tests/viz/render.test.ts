import { describe, it, expect, beforeAll } from "vitest";
import { renderBarChart } from "../../src/utils/viz/bars.js";
import { renderChamber } from "../../src/utils/viz/chamber.js";
import { renderComposition } from "../../src/utils/viz/composition.js";
import { renderEntityCardSync } from "../../src/utils/viz/profile.js";
import { renderTimeSeries, renderCandles, renderPriceWithVolume } from "../../src/utils/viz/timeseries.js";
import { renderTimeline, renderAchievements } from "../../src/utils/viz/timeline.js";
import { renderVersus } from "../../src/utils/viz/versus.js";
import { warmBrandAssets } from "../../src/utils/viz/brand.js";
import { ensureFonts } from "../../src/utils/viz/fonts.js";
import { SERIES } from "../../src/utils/viz/theme.js";
import { chartAttachment } from "../../src/utils/viz/attach.js";
import { initialsFor } from "../../src/utils/viz/avatar.js";

/** Decode a PNG header. Throws if the buffer is not a PNG. */
function pngSize(buf: Buffer): { width: number; height: number } {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(buf.subarray(0, 8).equals(signature)).toBe(true);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Every card renders at 2x for retina, so both dimensions must be even. */
function expectValidCard(buf: Buffer) {
  const { width, height } = pngSize(buf);
  expect(width).toBeGreaterThan(200);
  expect(height).toBeGreaterThan(100);
  // Discord rejects attachments over 10 MB; a card should be nowhere near it.
  expect(buf.length).toBeLessThan(2_000_000);
  return { width, height };
}

beforeAll(async () => {
  await warmBrandAssets();
});

describe("brand assets", () => {
  it("registers the vendored fonts — otherwise every card falls back to DejaVu", () => {
    expect(ensureFonts()).toBe(true);
  });

  it("decodes the vendored AHD mark", async () => {
    expect(await warmBrandAssets()).toBe(true);
  });
});

describe("renderBarChart", () => {
  const rows = [
    { label: "Expeditors", value: 58.88, color: SERIES[0], primary: "58.88%", secondary: "$946.4M" },
    { label: "Vermont Logistics", value: 7.1, color: SERIES[1], primary: "7.10%", secondary: "$114.2M" },
  ];

  it("renders", () => expectValidCard(renderBarChart({ title: "Logistics", rows })));

  it("grows with the row count", () => {
    const small = pngSize(renderBarChart({ title: "T", rows: rows.slice(0, 1) }));
    const large = pngSize(renderBarChart({ title: "T", rows: [...rows, ...rows, ...rows, ...rows] }));
    expect(large.height).toBeGreaterThan(small.height);
  });

  it("renders an empty state rather than throwing", () => {
    expectValidCard(renderBarChart({ title: "T", rows: [], emptyMessage: "Nothing here." }));
  });

  it("survives all-zero values without dividing by zero", () => {
    expectValidCard(
      renderBarChart({ title: "T", rows: [{ label: "A", value: 0, color: SERIES[0], primary: "0%" }] }),
    );
  });

  it("survives a very long label", () => {
    expectValidCard(
      renderBarChart({
        title: "T",
        rows: [{ label: "x".repeat(400), value: 1, color: SERIES[0], primary: "1%" }],
      }),
    );
  });
});

describe("renderChamber", () => {
  const parties = [
    { name: "Labour", seats: 314, color: "#e4003b" },
    { name: "Conservative", seats: 229, color: "#0087dc" },
    { name: "SDP", seats: 45, color: "#2a4b9b" },
  ];

  it("renders an arch chamber", async () => {
    expectValidCard(await renderChamber({ title: "House", totalSeats: 588, parties }));
  });

  it("renders a Westminster chamber", async () => {
    expectValidCard(
      await renderChamber({ title: "Commons", shape: "westminster", totalSeats: 625, parties }),
    );
  });

  it("handles the extremes the game actually has", async () => {
    // US Senate at one end, the NPC at the other.
    expectValidCard(
      await renderChamber({ title: "Senate", totalSeats: 100, parties: [{ name: "D", seats: 100, color: "#2a5fd6" }] }),
    );
    expectValidCard(
      await renderChamber({ title: "NPC", totalSeats: 2980, parties: [{ name: "CPC", seats: 2980, color: "#de2910" }] }),
    );
  });

  it("renders an empty state for a chamber with no seats", async () => {
    expectValidCard(await renderChamber({ title: "T", totalSeats: 0, parties: [] }));
  });

  it("does not throw when more seats are held than the chamber claims to have", async () => {
    expectValidCard(await renderChamber({ title: "T", totalSeats: 10, parties }));
  });
});

describe("renderComposition", () => {
  const segments = [
    { label: "Labour", value: 268, color: "#e4003b" },
    { label: "SDP", value: 45, color: "#2a4b9b" },
  ];

  it("renders with a threshold", () => {
    expectValidCard(renderComposition({ title: "Support", segments, total: 625, threshold: 313 }));
  });

  it("renders without a threshold", () => {
    expectValidCard(renderComposition({ title: "Support", segments, total: 625 }));
  });

  it("handles a threshold at the far right edge, where the label must flip inboard", () => {
    expectValidCard(renderComposition({ title: "Support", segments, total: 625, threshold: 625 }));
  });

  it("renders an empty state for a zero total", () => {
    expectValidCard(renderComposition({ title: "T", segments: [], total: 0 }));
  });
});

describe("renderVersus", () => {
  const sides = {
    left: { name: "Eleanor Vance", detail: "Senator", color: "#2a5fd6" },
    right: { name: "Marcus Thorne", detail: "Governor", color: "#c62828" },
  };

  it("renders", () => {
    expectValidCard(
      renderVersus({
        title: "A vs B",
        ...sides,
        metrics: [
          { label: "Influence", left: 12480, right: 11020 },
          { label: "Infamy", left: 18, right: 47, lowerIsBetter: true },
        ],
      }),
    );
  });

  it("survives a metric where both sides are zero", () => {
    expectValidCard(
      renderVersus({ title: "T", ...sides, metrics: [{ label: "Actions", left: 0, right: 0 }] }),
    );
  });

  it("renders an empty state with no metrics", () => {
    expectValidCard(renderVersus({ title: "T", ...sides, metrics: [] }));
  });
});

describe("renderEntityCardSync", () => {
  const base = {
    name: "Eleanor Vance",
    headline: [{ label: "PI", value: "12.5K" }],
    meters: [{ label: "Approval", value: 62, display: "62%", color: SERIES[2] }],
    rows: [{ label: "Actions", value: "6" }],
  };

  it("renders with a compass", () => {
    expectValidCard(renderEntityCardSync({ ...base, economic: 34, social: 51 }));
  });

  it("renders without a compass", () => {
    expectValidCard(renderEntityCardSync({ ...base, economic: null, social: null }));
  });

  it("clamps a compass value outside the documented range instead of drawing off-card", () => {
    expectValidCard(renderEntityCardSync({ ...base, economic: 9999, social: -9999 }));
  });

  it("renders with no meters and no rows", () => {
    expectValidCard(renderEntityCardSync({ name: "X", headline: [], meters: [], rows: [] }));
  });
});

describe("time series", () => {
  const labels = Array.from({ length: 40 }, (_, i) => `T${i}`);
  const values = labels.map((_, i) => 40 + Math.sin(i / 4) * 8);

  it("renders a single series", () => {
    expectValidCard(renderTimeSeries({ title: "T", labels, series: [{ name: "p", values }] }));
  });

  it("renders seven series, past the direct-label cap", () => {
    expectValidCard(
      renderTimeSeries({
        title: "T",
        labels,
        series: Array.from({ length: 7 }, (_, i) => ({ name: `S${i}`, values: values.map((v) => v + i) })),
      }),
    );
  });

  it("survives a flat series, where the axis would otherwise have zero height", () => {
    expectValidCard(
      renderTimeSeries({ title: "T", labels, series: [{ name: "p", values: labels.map(() => 50) }] }),
    );
  });

  it("survives holes in the data", () => {
    const holey = values.map((v, i) => (i % 5 === 0 ? NaN : v));
    expectValidCard(renderTimeSeries({ title: "T", labels, series: [{ name: "p", values: holey }] }));
  });

  it("renders an empty state with no points", () => {
    expectValidCard(renderTimeSeries({ title: "T", labels: [], series: [] }));
  });

  it("renders candles", () => {
    const candles = labels.map((label, i) => {
      const open = 40 + i * 0.2;
      const close = open + Math.sin(i) * 2;
      return { label, open, close, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1 };
    });
    expectValidCard(renderCandles({ title: "T", candles }));
    expectValidCard(renderCandles({ title: "T", candles: [] }));
  });

  it("renders price with a volume panel", () => {
    expectValidCard(
      renderPriceWithVolume({ title: "T", labels, price: values, volume: values.map((v) => v * 100) }),
    );
  });

  it("renders price with no volume data at all", () => {
    expectValidCard(renderPriceWithVolume({ title: "T", labels, price: values }));
  });
});

describe("timeline and achievements", () => {
  it("renders a career timeline", () => {
    expectValidCard(
      renderTimeline({
        title: "Career",
        events: [
          { outcome: "elected", office: "Senator", detail: "Democratic Party", date: "Mar 2026" },
          { outcome: "lost_election", office: "Governor", date: "Jun 2025" },
        ],
      }),
    );
  });

  it("renders an empty career", () => {
    expectValidCard(renderTimeline({ title: "Career", events: [] }));
  });

  it("renders achievements, including glyphs this box has no font for", () => {
    expectValidCard(
      renderAchievements({
        title: "Achievements",
        achievements: [
          { name: "First Blood", description: "Win your first election", icon: "🏆", highlighted: true },
          { name: "Kingmaker", description: "Endorse three winners", icon: "" },
        ],
      }),
    );
  });

  it("renders an empty achievement grid", () => {
    expectValidCard(renderAchievements({ title: "Achievements", achievements: [] }));
  });
});

describe("chartAttachment", () => {
  const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  it("never reuses a filename across renders", () => {
    // Discord caches attachments by name; reusing one when paging serves the
    // previous page's image while the embed updates around it.
    const names = new Set(
      Array.from({ length: 50 }, () => chartAttachment(buf, "marketshare", 1).file.name),
    );
    expect(names.size).toBe(50);
  });

  it("points the embed at its own attachment", () => {
    const a = chartAttachment(buf, "profile", "abc");
    expect(a.url).toBe(`attachment://${a.file.name}`);
  });

  it("strips characters that are not filename-safe", () => {
    const a = chartAttachment(buf, "race", "US/CA?x=1");
    expect(a.file.name).toMatch(/^[a-z0-9-]+\.png$/i);
  });
});

describe("initialsFor", () => {
  it("takes first and last initials", () => {
    expect(initialsFor("Eleanor Vance")).toBe("EV");
    expect(initialsFor("Mary Anne Blackwood")).toBe("MB");
  });

  it("takes two letters from a single name", () => {
    expect(initialsFor("Rgold")).toBe("RG");
  });

  it("splits on the separators Discord usernames use", () => {
    expect(initialsFor("eleanor_vance")).toBe("EV");
    expect(initialsFor("eleanor.vance")).toBe("EV");
    expect(initialsFor("eleanor-vance")).toBe("EV");
  });

  it("falls back rather than throwing on an empty name", () => {
    expect(initialsFor("")).toBe("?");
    expect(initialsFor("   ")).toBe("?");
  });
});
