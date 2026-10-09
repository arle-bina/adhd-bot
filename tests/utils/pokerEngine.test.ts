import { describe, expect, it } from "vitest";
import {
  act,
  chipCounts,
  compareScores,
  createTable,
  finishHand,
  legalActions,
  scoreHand,
  startHand,
  type PokerCard,
  type PokerTable,
} from "../../src/utils/pokerEngine.js";

function cards(spec: string): PokerCard[] {
  const suits: Record<string, PokerCard["suit"]> = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const ranks: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
  return spec.split(" ").map((c) => ({ rank: ranks[c[0]] ?? Number(c[0]), suit: suits[c[1]] }));
}

const total = (t: PokerTable) => Object.values(chipCounts(t)).reduce((a, b) => a + b, 0);

/** Fix the cards: hole pairs in seat order, then the five board cards. */
function rig(t: PokerTable, holes: string[], board: string): void {
  t.seats.forEach((s, i) => (s.hole = cards(holes[i])));
  // The deck is popped from the end: flop, turn, river.
  t.deck = cards(board).reverse();
}

describe("hand scoring", () => {
  it("ranks every category", () => {
    const order = [
      "2s 5d 9h Jc Kd 3c 7h",
      "2s 2d 9h Jc Kd 3c 7h",
      "2s 2d 9h 9c Kd 3c 7h",
      "2s 2d 2h 9c Kd 3c 7h",
      "As 2d 3h 4c 5d Kc Kh",
      "2h 5h 9h Jh Kh 3c 7d",
      "2s 2d 2h 9c 9d 3c 7h",
      "2s 2d 2h 2c Kd 3c 7h",
      "5h 6h 7h 8h 9h 2c 2d",
    ].map((h) => scoreHand(cards(h)));
    for (let i = 1; i < order.length; i++) expect(compareScores(order[i], order[i - 1])).toBeGreaterThan(0);
    expect(order[4]).toEqual([4, 5]);
  });

  it("uses kickers", () => {
    expect(compareScores(scoreHand(cards("As Ad Kh 7c 4d 3c 2h")), scoreHand(cards("As Ad Qh 7c 4d 3c 2h")))).toBeGreaterThan(0);
    expect(compareScores(scoreHand(cards("Ks Kd Kh Qc Qd 2c 2h")), scoreHand(cards("Ks Kd Kh Qc Qd 3c 3h")))).toBe(0);
  });
});

describe("table flow", () => {
  it("posts blinds heads-up with the dealer on the small blind and conserves chips", () => {
    const t = createTable([{ id: "a", name: "A" }, { id: "b", name: "B" }], 1000, 20);
    startHand(t, () => 0.5);
    expect(t.seats[t.dealer].streetBet).toBe(10);
    expect(t.toAct).toBe(t.dealer);
    expect(total(t)).toBe(2000);
    expect(act(t, t.seats[t.toAct].id, { type: "call" })).toBe(true);
    // Big blind gets the option.
    expect(legalActions(t)).toMatchObject({ canCheck: true, canRaise: true });
    expect(act(t, t.seats[t.toAct].id, { type: "check" })).toBe(true);
    expect(t.street).toBe("flop");
  });

  it("rejects out-of-turn and undersized moves", () => {
    const t = createTable([{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }], 1000, 20);
    startHand(t, () => 0.5);
    const waiting = t.seats.find((s, i) => i !== t.toAct)!;
    expect(act(t, waiting.id, { type: "fold" })).toBe(false);
    expect(act(t, t.seats[t.toAct].id, { type: "raise", to: 25 })).toBe(false);
    expect(act(t, t.seats[t.toAct].id, { type: "check" })).toBe(false);
  });

  it("awards the pot to the last player standing", () => {
    const t = createTable([{ id: "a", name: "A" }, { id: "b", name: "B" }], 1000, 20);
    startHand(t, () => 0.5);
    act(t, t.seats[t.toAct].id, { type: "fold" });
    const result = finishHand(t);
    expect(result.winners).toHaveLength(1);
    expect(total(t)).toBe(2000);
    expect(t.seats.map((s) => s.stack).sort((x, y) => x - y)).toEqual([990, 1010]);
  });

  it("splits side pots when a short stack is all in", () => {
    const t = createTable(
      [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
      1000,
      20,
    );
    t.seats[0].stack = 100;
    startHand(t, () => 0.5);
    rig(t, ["As Ad", "Ks Kd", "Qs Qd"], "2c 7h 9d 3s 4h");
    // Everyone goes all in or calls all in.
    while (t.toAct >= 0) {
      const legal = legalActions(t)!;
      const s = t.seats[t.toAct];
      act(t, s.id, legal.canRaise ? { type: "raise", to: legal.maxRaiseTo } : { type: "call" });
    }
    expect(t.street).toBe("showdown");
    finishHand(t);
    const stacks = Object.fromEntries(t.seats.map((s) => [s.id, s.stack]));
    // A wins the 300 main pot; B beats C for the side pot.
    expect(stacks).toEqual({ a: 300, b: 1800, c: 0 });
    expect(t.seats.find((s) => s.id === "c")!.busted).toBe(true);
  });

  it("voids an unfinished hand in the final chip counts", () => {
    const t = createTable([{ id: "a", name: "A" }, { id: "b", name: "B" }], 1000, 20);
    startHand(t, () => 0.5);
    act(t, t.seats[t.toAct].id, { type: "raise", to: 200 });
    expect(chipCounts(t)).toEqual({ a: 1000, b: 1000 });
  });
});
