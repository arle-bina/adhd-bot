import { describe, it, expect } from "vitest";
import {
  archLayout,
  buildWestminsterParliament,
  computeRowRadii,
  getParliamentSizing,
  splitBenches,
  type ChamberParty,
} from "../../src/utils/viz/chamber.js";

const COMMONS: ChamberParty[] = [
  { name: "Labour", seats: 314, color: "#e4003b" },
  { name: "Conservative", seats: 229, color: "#0087dc" },
  { name: "SDP", seats: 45, color: "#2a4b9b" },
  { name: "Plaid Cymru", seats: 26, color: "#12a67c" },
  { name: "Liberal", seats: 11, color: "#faa61a" },
];

describe("getParliamentSizing", () => {
  it("matches the game's tiers at each breakpoint", () => {
    expect(getParliamentSizing(100).dotR).toBe(7); // US Senate
    expect(getParliamentSizing(110).dotR).toBe(7);
    expect(getParliamentSizing(111).dotR).toBe(5);
    expect(getParliamentSizing(435).dotR).toBe(3.4); // US House
    expect(getParliamentSizing(650).dotR).toBe(3.4); // UK Commons
    expect(getParliamentSizing(736).dotR).toBe(3.4); // Bundestag
    expect(getParliamentSizing(751).dotR).toBe(2.2);
    expect(getParliamentSizing(2980).dotR).toBe(1.6); // CN NPC
  });
});

describe("computeRowRadii", () => {
  it("packs enough rows to hold every seat", () => {
    for (const total of [100, 435, 650, 736, 2980]) {
      const sizing = getParliamentSizing(total);
      const { rowRadii } = computeRowRadii(sizing, total);
      const minGap = sizing.dotR * 2.4;
      const capacity = rowRadii.reduce((s, r) => s + Math.max(1, Math.floor((Math.PI * r) / minGap)), 0);
      expect(capacity).toBeGreaterThanOrEqual(total);
    }
  });
});

describe("archLayout", () => {
  it("places exactly one seat per member", () => {
    for (const total of [1, 100, 435, 650, 2980]) {
      expect(archLayout(total).seats).toHaveLength(total);
    }
  });

  it("returns nothing for an empty chamber", () => {
    expect(archLayout(0).seats).toHaveLength(0);
    expect(archLayout(-5).seats).toHaveLength(0);
  });

  it("orders seats left to right", () => {
    const { seats } = archLayout(435);
    for (let i = 1; i < seats.length; i++) {
      expect(seats[i].t).toBeGreaterThanOrEqual(seats[i - 1].t);
    }
    // t runs 0 (far left) to 1 (far right), so x should broadly increase too.
    expect(seats[0].x).toBeLessThan(seats[seats.length - 1].x);
  });
});

describe("splitBenches", () => {
  it("gives the largest party the government benches by default", () => {
    const { government, opposition } = splitBenches(COMMONS);
    expect(government.map((p) => p.name)).toEqual(["Labour"]);
    expect(opposition).toHaveLength(4);
  });

  it("honours an explicit government when the game supplies one", () => {
    const { government, opposition } = splitBenches(COMMONS, ["Conservative", "Liberal"]);
    expect(government.map((p) => p.name)).toEqual(["Conservative", "Liberal"]);
    expect(opposition.map((p) => p.name)).not.toContain("Conservative");
  });
});

describe("buildWestminsterParliament", () => {
  it("seats government right, the two next-largest left, the rest crossbench", () => {
    const p = buildWestminsterParliament(COMMONS, 625);
    expect(Object.keys(p.right)).toEqual(["Labour"]);
    expect(Object.keys(p.left)).toEqual(["Conservative", "SDP"]);
    expect(Object.keys(p.crossBench)).toEqual(["Plaid Cymru", "Liberal"]);
  });

  it("accounts for every seat in the chamber", () => {
    const p = buildWestminsterParliament(COMMONS, 625);
    const sum = [p.left, p.right, p.crossBench, p.headBench]
      .flatMap((side) => Object.values(side))
      .reduce((s, v) => s + v.seats, 0);
    expect(sum).toBe(625);
  });

  it("puts unfilled seats on the crossbenches as vacant", () => {
    const p = buildWestminsterParliament(COMMONS, 700);
    expect(p.crossBench.__vacant__.seats).toBe(700 - 625);
  });

  it("adds no vacant entry when the chamber is full", () => {
    const p = buildWestminsterParliament(COMMONS, 625);
    expect(p.crossBench.__vacant__).toBeUndefined();
  });

  it("never emits a seat colour that is invisible on the surface", () => {
    const p = buildWestminsterParliament(
      [{ name: "CDU/CSU", seats: 152, color: "#32302e" }],
      152,
    );
    expect(p.right["CDU/CSU"].colour).not.toBe("#32302e");
  });
});
