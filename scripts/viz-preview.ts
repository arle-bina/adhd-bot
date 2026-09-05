/**
 * Render every house chart to PNG with representative fixtures, so chart design
 * can be iterated on without a Discord round-trip.
 *
 *   npx tsx scripts/viz-preview.ts [outDir]
 *
 * Output defaults to `.viz-preview/` (gitignored). Open the PNGs and look at
 * them — the palette validator checks colour, not layout.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderBarChart } from "../src/utils/viz/bars.js";
import { renderChamber } from "../src/utils/viz/chamber.js";
import { warmBrandAssets } from "../src/utils/viz/brand.js";
import { renderTimeSeries, renderCandles } from "../src/utils/viz/timeseries.js";
import { OTHERS, SERIES, UNOWNED, brandColor } from "../src/utils/viz/theme.js";
import { compactMoney, compactNumber } from "../src/utils/viz/format.js";
import { renderEntityCardSync, approvalColor, infamyColor } from "../src/utils/viz/profile.js";
import { partyAxisToCompass, seriesColor } from "../src/utils/viz/theme.js";
import { renderComposition } from "../src/utils/viz/composition.js";
import { renderVersus } from "../src/utils/viz/versus.js";
import { renderTimeline, renderAchievements } from "../src/utils/viz/timeline.js";

await warmBrandAssets();

const out = process.argv[2] ?? ".viz-preview";
mkdirSync(out, { recursive: true });

const write = (name: string, buf: Buffer) => {
  writeFileSync(join(out, name), buf);
  console.log(`  ${name}  ${(buf.length / 1024).toFixed(0)} KB`);
};

// ── /marketshare ────────────────────────────────────────────────────────────
const corps: Array<[string, number, number, boolean]> = [
  ["Expeditors", 58.88, 946_400_000, false],
  ["Czechoslovak Logistics Enterprise", 8.65, 139_200_000, true],
  ["Vermont Logistics", 7.1, 114_200_000, false],
  ["Aeropagus Incorporated", 3.62, 58_200_000, false],
  ["Lockheed Commerce", 3.55, 57_100_000, false],
  ["Hungarian Logistics Enterprise", 3.21, 51_610_696, true],
  ["Yugoslav Logistics Enterprise", 3.05, 49_043_322, true],
  ["Romanian Logistics Enterprise", 1.72, 27_708_725, true],
  ["Doofenshmirtz Evil Incorporated", 1.68, 27_062_735, false],
  ["Polish Logistics Enterprise", 1.63, 26_298_608, true],
  ["Butxot-Freiburg Extraction and Rail", 1.43, 22_960_384, false],
  ["Bulgarian Logistics Enterprise", 1.32, 21_218_715, true],
  ["Ukrainian Logistics Enterprise", 0.51, 8_147_197, true],
  ["Rgold", 0.46, 7_420_474, false],
  ["Atlas Automotive", 0.38, 6_139_122, false],
];

const rows = corps.map(([label, pct, rev, nc], i) => ({
  label,
  value: pct,
  color: brandColor(null, i),
  primary: `${pct.toFixed(2)}%`,
  secondary: compactMoney(rev, "$"),
  tag: nc ? "NatCorp" : undefined,
}));
rows.push({ label: "Others", value: 2.81, color: OTHERS, primary: "2.81%", secondary: compactMoney(45_000_000, "$"), tag: undefined });
rows.push({ label: "Unowned", value: 0.0, color: UNOWNED, primary: "0.00%", secondary: "—", tag: undefined });

console.log("marketshare:");
write("marketshare.png", renderBarChart({
  title: "Logistics — Global",
  subtitle: "Market share by revenue · page 1 of 8",
  footerLeft: "Turn 612 · TAM $1.61B · USD",
  rows,
}));

write("marketshare-sparse.png", renderBarChart({
  title: "Aerospace — United States",
  subtitle: "Market share by revenue",
  footerLeft: "Turn 612 · TAM $88.2M · USD",
  rows: rows.slice(0, 3),
}));

write("marketshare-empty.png", renderBarChart({
  title: "Shipbuilding — Ireland",
  subtitle: "Market share by revenue",
  footerLeft: "Turn 612 · USD",
  rows: [],
  emptyMessage: "No corporations in this market yet.",
}));

// ── /predict ────────────────────────────────────────────────────────────────
console.log("predict:");
write("hemicycle.png", await renderChamber({
  title: "House of Representatives — projection",
  subtitle: "435 seats · 218 for a majority",
  footerLeft: "Turn 612 · Modelled from current polling",
  totalSeats: 435,
  majority: 218,
  parties: [
    { name: "Democratic Party", seats: 221, color: "#2a5fd6" },
    { name: "Republican Party", seats: 198, color: "#c62828" },
    { name: "Progressive Caucus", seats: 9, color: "#12a67c" },
    { name: "Independent", seats: 7, color: SERIES[3] },
  ],
}));

write("hemicycle-many.png", await renderChamber({
  title: "Bundestag — projection",
  subtitle: "598 seats · 300 for a majority",
  footerLeft: "Turn 612 · Modelled from current polling",
  totalSeats: 598,
  majority: 300,
  parties: [
    { name: "SPD", seats: 168, color: "#e3000f" },
    { name: "CDU/CSU", seats: 152, color: "#32302e" },
    { name: "Grüne", seats: 91, color: "#1aa037" },
    { name: "FDP", seats: 74, color: "#ffcc00" },
    { name: "Die Linke", seats: 63, color: "#be3075" },
    { name: "Others", seats: 50, color: OTHERS },
  ],
}));

write("westminster.png", await renderChamber({
  shape: "westminster",
  title: "House of Commons — projection",
  subtitle: "625 seats · 313 for a majority",
  footerLeft: "Projected from current standing",
  totalSeats: 625,
  majority: 313,
  parties: [
    { name: "Labour Party", seats: 314, color: "#e4003b" },
    { name: "The Conservative and Unionist Party", seats: 229, color: "#0087dc" },
    { name: "Social Democratic Party", seats: 45, color: "#2a4b9b" },
    { name: "Plaid Cymru", seats: 26, color: "#12a67c" },
    { name: "Liberal Party", seats: 11, color: "#faa61a" },
  ],
}));

write("westminster-hung.png", await renderChamber({
  shape: "westminster",
  title: "House of Commons — projection",
  subtitle: "625 seats · 313 for a majority",
  footerLeft: "Projected from current standing",
  totalSeats: 625,
  majority: 313,
  parties: [
    { name: "Labour Party", seats: 268, color: "#e4003b" },
    { name: "The Conservative and Unionist Party", seats: 251, color: "#0087dc" },
    { name: "Social Democratic Party", seats: 61, color: "#2a4b9b" },
    { name: "Plaid Cymru", seats: 30, color: "#12a67c" },
    { name: "Liberal Party", seats: 15, color: "#faa61a" },
  ],
}));

// ── time series ─────────────────────────────────────────────────────────────
console.log("timeseries:");
const walk = (n: number, start: number, drift: number, vol: number) => {
  let v = start;
  return Array.from({ length: n }, () => {
    v = Math.max(0.1, v * (1 + drift + (Math.sin(v * 7.3) * vol)));
    return v;
  });
};

write("stock-single.png", renderTimeSeries({
  title: "Expeditors — share price",
  subtitle: "NYSE · last 60 turns",
  footerLeft: "Turn 612 · USD",
  labels: Array.from({ length: 60 }, (_, i) => `T${553 + i}`),
  series: [{ name: "Share price", values: walk(60, 42, 0.004, 0.012) }],
  valueFormat: "money",
  currencySymbol: "$",
  directional: true,
}));

write("stock-down.png", renderTimeSeries({
  title: "Atlas Automotive — market cap",
  subtitle: "Last 40 turns",
  footerLeft: "Turn 612 · USD",
  labels: Array.from({ length: 40 }, (_, i) => `T${573 + i}`),
  series: [{ name: "Market cap", values: walk(40, 90_000_000, -0.012, 0.006) }],
  valueFormat: "money",
  currencySymbol: "$",
  directional: true,
}));

write("forex.png", renderTimeSeries({
  title: "Currency performance",
  subtitle: "Change vs. period open · last 48 turns",
  footerLeft: "Turn 612 · Indexed to first observation",
  labels: Array.from({ length: 48 }, (_, i) => `T${565 + i}`),
  series: [
    { name: "USD", values: walk(48, 100, 0.0006, 0.002).map((v) => v - 100) },
    { name: "GBP", values: walk(48, 100, -0.0011, 0.003).map((v) => v - 100) },
    { name: "EUR", values: walk(48, 100, 0.0018, 0.0025).map((v) => v - 100) },
    { name: "JPY", values: walk(48, 100, -0.002, 0.0018).map((v) => v - 100) },
    { name: "BRL", values: walk(48, 100, 0.0032, 0.004).map((v) => v - 100) },
    { name: "CNY", values: walk(48, 100, 0.0004, 0.0012).map((v) => v - 100) },
    { name: "NGN", values: walk(48, 100, -0.0035, 0.005).map((v) => v - 100) },
  ],
  valueFormat: "percent",
  zeroBaseline: true,
}));

write("serverstats.png", renderTimeSeries({
  title: "A House Divided — daily messages",
  subtitle: "Last 30 days",
  footerLeft: "Total 41,208 · Avg 1,374/day",
  labels: Array.from({ length: 30 }, (_, i) => `Aug ${i + 6}`),
  series: [{ name: "Messages", values: walk(30, 1200, 0.006, 0.05) }],
  valueFormat: "number",
  fill: true,
}));

console.log("candles:");
const candles = Array.from({ length: 34 }, (_, i) => {
  const base = 40 + Math.sin(i / 3) * 6 + i * 0.25;
  const open = base + Math.sin(i * 2.1) * 1.2;
  const close = base + Math.cos(i * 1.7) * 1.4;
  return { label: `T${578 + i}`, open, close, high: Math.max(open, close) + 1.1, low: Math.min(open, close) - 1.3 };
});
write("candles.png", renderCandles({
  title: "NYSE — price range",
  subtitle: "Last 34 turns · open/high/low/close",
  footerLeft: "Turn 612 · USD",
  candles,
  currencySymbol: "$",
}));



// ── /profile ────────────────────────────────────────────────────────────────
console.log("profile:");
write("profile.png", renderEntityCardSync({
  name: "Eleanor Vance",
  position: "Senator · Vermont · United States",
  chip: "Democratic Party",
  accent: "#2a5fd6",
  banner: "Contesting: Senate (Vermont)",
  economic: 34,
  social: 51,
  headline: [
    { label: "Political influence", value: compactNumber(12_480) },
    { label: "National influence", value: compactNumber(3_180) },
    { label: "Funds", value: compactMoney(1_204_000, "$") },
  ],
  meters: [
    { label: "Approval", value: 62, display: "62%", color: approvalColor(62) },
    { label: "Infamy", value: 18, display: "18 / 100", color: infamyColor(18) },
  ],
  rows: [
    { label: "Actions", value: "6" },
    { label: "Donor base", value: "Level 4" },
    { label: "Portfolio", value: `${compactMoney(8_400_000, "$")} · #2` },
    { label: "CEO of", value: "Vermont Logistics" },
    { label: "Joined", value: "Mar 2026" },
  ],
  footerLeft: "Turn 612 · Values USD",
}));

write("profile-minimal.png", renderEntityCardSync({
  name: "Hollis Barrow",
  position: "Backbencher · Yorkshire · United Kingdom",
  chip: "Labour",
  accent: "#d0021b",
  economic: null,
  social: null,
  headline: [
    { label: "Political influence", value: compactNumber(842) },
    { label: "National influence", value: compactNumber(96) },
    { label: "Funds", value: compactMoney(18_400, "\u00a3") },
  ],
  meters: [
    { label: "Approval", value: 31, display: "31%", color: approvalColor(31) },
    { label: "Infamy", value: 74, display: "74 / 100", color: infamyColor(74) },
  ],
  rows: [
    { label: "Actions", value: "2" },
    { label: "Donor base", value: "Level 1" },
    { label: "Joined", value: "Aug 2026" },
  ],
  footerLeft: "Turn 612 · Values GBP",
}));

// ── /leaderboard ────────────────────────────────────────────────────────────
console.log("leaderboard:");
const players: Array<[string, string, string, string, number]> = [
  ["Eleanor Vance", "Senator", "VT", "#2a5fd6", 12480],
  ["Marcus Thorne", "Governor", "TX", "#c62828", 11020],
  ["Ada Okonkwo", "Representative", "NY", "#2a5fd6", 9640],
  ["Hollis Barrow", "Representative", "OH", "#c62828", 8210],
  ["Yuki Tanaka", "Senator", "CA", "#12a67c", 7455],
  ["Petra Novak", "Mayor", "IL", "#2a5fd6", 6180],
  ["Sam Whitfield", "Representative", "FL", "#c62828", 5240],
  ["Iris Delgado", "Senator", "AZ", "#2a5fd6", 4870],
  ["Noor Haddad", "Representative", "MI", "#faa61a", 3310],
  ["Cassius Bell", "Representative", "GA", "#c62828", 2890],
];
write("leaderboard.png", renderBarChart({
  title: "Political Influence — United States",
  subtitle: "Top politicians · page 1 of 4",
  labelFraction: 0.42,
  rows: players.map(([name, office, st, color, pi], i) => ({
    label: name,
    value: pi,
    color: brandColor(color, i),
    primary: compactNumber(pi),
    tag: `${office} · ${st}`,
  })),
}));

// ── /sectors ────────────────────────────────────────────────────────────────
console.log("sectors:");
write("sectors.png", renderBarChart({
  title: "Technology — top sectors by revenue",
  subtitle: "84 sectors · page 1 of 9",
  footerLeft: "Revenue · growth % · Values USD",
  labelFraction: 0.38,
  rows: [
    ["Aeropagus Incorporated", "California", 412_000_000, 4.2],
    ["Vermont Logistics", "Vermont", 288_400_000, 1.8],
    ["Rgold", "Nevada", 190_100_000, -2.4],
    ["Atlas Automotive", "Michigan", 142_700_000, 0.6],
    ["Butxot-Freiburg", "Texas", 96_300_000, 7.1],
    ["Lockheed Commerce", "Georgia", 61_500_000, -0.9],
  ].map(([name, state, rev, growth], i) => ({
    label: name as string,
    value: rev as number,
    color: SERIES[i % SERIES.length],
    primary: compactMoney(rev as number, "$"),
    secondary: `${(growth as number) >= 0 ? "+" : ""}${(growth as number).toFixed(1)}%`,
    tag: state as string,
  })),
}));

// ── /election ───────────────────────────────────────────────────────────────
console.log("election:");
write("race.png", renderBarChart({
  title: "Senate — Vermont",
  subtitle: "General election · 412.8K votes counted",
  footerLeft: "Updates each turn",
  labelFraction: 0.36,
  rows: [
    { label: "Eleanor Vance", value: 51.4, color: "#2a5fd6", primary: "51.4%", secondary: "212.2K votes", tag: "Democratic Party" },
    { label: "Marcus Thorne", value: 44.1, color: "#c62828", primary: "44.1%", secondary: "182.0K votes", tag: "Republican Party" },
    { label: "Noor Haddad", value: 3.2, color: "#12a67c", primary: "3.2%", secondary: "13.2K votes", tag: "Progressive · NPP" },
    { label: "Cassius Bell", value: 1.3, color: "#faa61a", primary: "1.3%", secondary: "5.4K votes", tag: "Liberal Party" },
  ],
}));



// ── /party ──────────────────────────────────────────────────────────────────
console.log("party:");
write("party.png", renderEntityCardSync({
  name: "Democratic Party",
  position: "[DEM] · United States",
  chip: "Left-Liberal",
  accent: "#2a5fd6",
  banner: "Chair: Eleanor Vance",
  economic: partyAxisToCompass(-2.4),
  social: partyAxisToCompass(-3.1),
  headline: [
    { label: "Members", value: compactNumber(1_284) },
    { label: "Treasury", value: compactMoney(24_800_000, "$") },
    { label: "Chair", value: "Eleanor Vance" },
  ],
  meters: [],
  rows: [
    { label: "Eleanor Vance", value: "Senator" },
    { label: "Ada Okonkwo", value: "Representative" },
    { label: "Petra Novak", value: "Mayor" },
    { label: "Iris Delgado", value: "Senator" },
    { label: "Yuki Tanaka", value: "Senator" },
  ],
  footerLeft: "Values USD",
}));



// ── /government ─────────────────────────────────────────────────────────────
console.log("government:");
write("government.png", renderComposition({
  title: "United Kingdom — government support",
  subtitle: "Coalition · Formed · PM Eleanor Vance",
  footerLeft: "329 of 625 seats supporting",
  segments: [
    { label: "Labour Party", value: 268, color: "#e4003b" },
    { label: "Social Democratic Party", value: 45, color: "#2a4b9b" },
    { label: "Plaid Cymru", value: 16, color: "#12a67c" },
  ],
  total: 625,
  threshold: 313,
  thresholdLabel: "Majority",
  unit: "seats",
  remainderLabel: "Not supporting",
}));

write("government-short.png", renderComposition({
  title: "Germany — government support",
  subtitle: "Minority · Pending",
  footerLeft: "242 of 598 seats supporting",
  segments: [
    { label: "SPD", value: 168, color: "#e3000f" },
    { label: "Grüne", value: 74, color: "#1aa037" },
  ],
  total: 598,
  threshold: 300,
  thresholdLabel: "Majority",
  unit: "seats",
  remainderLabel: "Not supporting",
}));



// ── /compare ────────────────────────────────────────────────────────────────
console.log("compare:");
write("compare.png", renderVersus({
  title: "Eleanor Vance vs Marcus Thorne",
  subtitle: "Each metric scaled to its own pair",
  footerLeft: "Values USD",
  left: { name: "Eleanor Vance", detail: "Senator · Democratic Party", color: "#2a5fd6" },
  right: { name: "Marcus Thorne", detail: "Governor · Republican Party", color: "#c62828" },
  metrics: [
    { label: "Political influence", left: 12480, right: 11020, leftDisplay: "12.5K", rightDisplay: "11.0K" },
    { label: "National influence", left: 3180, right: 4210, leftDisplay: "3.2K", rightDisplay: "4.2K" },
    { label: "Approval", left: 62, right: 54, leftDisplay: "62%", rightDisplay: "54%" },
    { label: "Infamy", left: 18, right: 47, leftDisplay: "18", rightDisplay: "47", lowerIsBetter: true },
    { label: "Funds", left: 1204000, right: 2840000, leftDisplay: "$1.2M", rightDisplay: "$2.8M" },
    { label: "Actions", left: 6, right: 4, leftDisplay: "6", rightDisplay: "4" },
    { label: "Donor base", left: 4, right: 5, leftDisplay: "4", rightDisplay: "5" },
  ],
}));



// ── /profile career + achievements ──────────────────────────────────────────
console.log("profile tabs:");
write("career.png", renderTimeline({
  title: "Eleanor Vance — career",
  subtitle: "9 events",
  footerLeft: "Democratic Party",
  events: [
    { outcome: "elected", office: "Senator (Vermont)", detail: "Democratic Party", date: "Mar 2026" },
    { outcome: "elected", office: "Representative (VT-1)", detail: "Democratic Party", date: "Nov 2025" },
    { outcome: "appointed", office: "Chair, Ways and Means", detail: "Democratic Party", date: "Sep 2025" },
    { outcome: "lost_election", office: "Governor (Vermont)", detail: "Democratic Party", date: "Jun 2025" },
    { outcome: "resigned", office: "Mayor (Burlington)", detail: "Democratic Party", date: "Feb 2025" },
    { outcome: "elected", office: "Mayor (Burlington)", detail: "Independent", date: "Aug 2024" },
    { outcome: "removed", office: "State Senator (VT)", detail: "Independent", date: "Mar 2024" },
  ],
}));

write("achievements.png", renderAchievements({
  title: "Eleanor Vance — achievements",
  subtitle: "18 earned · showing 8",
  footerLeft: "Democratic Party",
  achievements: [
    { name: "First Blood", description: "Win your first election", icon: "\u2b50", highlighted: true },
    { name: "Kingmaker", description: "Endorse three winning candidates", icon: "\u265a", highlighted: true },
    { name: "Rainmaker", description: "Raise $1M in a single cycle", icon: "\u25c9" },
    { name: "Floor Leader", description: "Pass ten bills", icon: "\u25a0" },
    { name: "Comeback", description: "Win after losing a general", icon: "\u21ba" },
    { name: "Landslide", description: "Win by more than 30 points", icon: "\u25b2" },
    { name: "Committee Chair", description: "Chair any standing committee", icon: "\u25c6" },
    { name: "Whip Count", description: "Flip five votes on one bill", icon: "\u2726" },
  ],
}));

console.log(`\nWrote previews to ${out}/`);
