// No-limit Texas hold'em for a Discord table. Pure state machine: the command
// layer owns timers and messages, this file owns the rules. Chips are table
// chips; the game server converts final stacks back into money.

export type Suit = "♠" | "♥" | "♦" | "♣";
export interface PokerCard {
  /** 2..14, ace high. */
  rank: number;
  suit: Suit;
}

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";

export interface Seat {
  id: string;
  name: string;
  stack: number;
  hole: PokerCard[];
  folded: boolean;
  allIn: boolean;
  /** Chips put in on the current street. */
  streetBet: number;
  /** Chips put in this hand. */
  handBet: number;
  /** Acted since the last bet or raise on this street. */
  acted: boolean;
  /** Out of chips: sits out until the table ends. */
  busted: boolean;
}

export interface PokerTable {
  seats: Seat[];
  dealer: number;
  smallBlind: number;
  bigBlind: number;
  deck: PokerCard[];
  board: PokerCard[];
  street: Street;
  /** Index of the seat to act, or -1 when nobody can act. */
  toAct: number;
  currentBet: number;
  minRaise: number;
  handNumber: number;
  /** A hand has been dealt and its pot not yet awarded. */
  handOpen: boolean;
  log: string[];
}

export type PokerAction =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; to: number };

export interface HandResult {
  winners: { id: string; amount: number; hand: string }[];
  /** Hole cards shown at showdown, by seat id. */
  shown: Record<string, PokerCard[]>;
}

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

export function newDeck(rng: () => number): PokerCard[] {
  const deck: PokerCard[] = [];
  for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const RANK_LABEL: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
export function cardLabel(c: PokerCard): string {
  return `${RANK_LABEL[c.rank] ?? String(c.rank)}${c.suit}`;
}

// ---------------------------------------------------------------------------
// Hand evaluation
// ---------------------------------------------------------------------------

export const HAND_NAMES = [
  "High card",
  "Pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
] as const;

/** Comparable score: [category, ...tiebreak ranks]. Higher wins, compared left to right. */
export type HandScore = number[];

function straightHigh(ranks: number[]): number {
  const set = new Set(ranks);
  if (set.has(14)) set.add(1);
  for (let high = 14; high >= 5; high--) {
    let run = true;
    for (let r = high; r > high - 5; r--) if (!set.has(r)) run = false;
    if (run) return high;
  }
  return 0;
}

/** Best five-card score from five to seven cards. */
export function scoreHand(cards: PokerCard[]): HandScore {
  const bySuit = new Map<Suit, number[]>();
  const counts = new Map<number, number>();
  for (const c of cards) {
    bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), c.rank]);
    counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  }
  const ranksDesc = [...counts.keys()].sort((a, b) => b - a);

  for (const suited of bySuit.values()) {
    if (suited.length >= 5) {
      const sf = straightHigh(suited);
      if (sf) return [8, sf];
    }
  }
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const quads = groups.find(([, n]) => n === 4);
  if (quads) return [7, quads[0], ranksDesc.find((r) => r !== quads[0])!];
  const trips = groups.filter(([, n]) => n === 3).map(([r]) => r);
  const pairs = groups.filter(([, n]) => n === 2).map(([r]) => r);
  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    const pairRank = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return [6, trips[0], pairRank];
  }
  for (const suited of bySuit.values()) {
    if (suited.length >= 5) return [5, ...suited.sort((a, b) => b - a).slice(0, 5)];
  }
  const straight = straightHigh(ranksDesc);
  if (straight) return [4, straight];
  if (trips.length > 0) return [3, trips[0], ...ranksDesc.filter((r) => r !== trips[0]).slice(0, 2)];
  if (pairs.length >= 2) {
    const [hi, lo] = pairs;
    return [2, hi, lo, ranksDesc.find((r) => r !== hi && r !== lo)!];
  }
  if (pairs.length === 1) return [1, pairs[0], ...ranksDesc.filter((r) => r !== pairs[0]).slice(0, 3)];
  return [0, ...ranksDesc.slice(0, 5)];
}

export function compareScores(a: HandScore, b: HandScore): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Table flow
// ---------------------------------------------------------------------------

export function createTable(
  players: { id: string; name: string }[],
  startingChips: number,
  bigBlind: number,
): PokerTable {
  return {
    seats: players.map((p) => ({
      id: p.id,
      name: p.name,
      stack: startingChips,
      hole: [],
      folded: false,
      allIn: false,
      streetBet: 0,
      handBet: 0,
      acted: false,
      busted: false,
    })),
    dealer: -1,
    smallBlind: Math.max(1, Math.floor(bigBlind / 2)),
    bigBlind,
    deck: [],
    board: [],
    street: "showdown",
    toAct: -1,
    currentBet: 0,
    minRaise: bigBlind,
    handNumber: 0,
    handOpen: false,
    log: [],
  };
}

export function liveSeats(t: PokerTable): Seat[] {
  return t.seats.filter((s) => !s.busted);
}

/** The table is over once one player holds every chip. */
export function tableFinished(t: PokerTable): boolean {
  return liveSeats(t).length <= 1;
}

function nextIndex(t: PokerTable, from: number, pred: (s: Seat) => boolean): number {
  for (let step = 1; step <= t.seats.length; step++) {
    const i = (from + step) % t.seats.length;
    if (pred(t.seats[i])) return i;
  }
  return -1;
}

const inHand = (s: Seat) => !s.busted && !s.folded;
const canAct = (s: Seat) => inHand(s) && !s.allIn;

function commit(t: PokerTable, seat: Seat, amount: number): void {
  const paid = Math.min(amount, seat.stack);
  seat.stack -= paid;
  seat.streetBet += paid;
  seat.handBet += paid;
  if (seat.stack === 0) seat.allIn = true;
}

export function startHand(t: PokerTable, rng: () => number): void {
  if (tableFinished(t)) throw new Error("Table is finished");
  t.handNumber += 1;
  t.handOpen = true;
  t.deck = newDeck(rng);
  t.board = [];
  t.log = [];
  for (const s of t.seats) {
    s.hole = [];
    s.folded = s.busted;
    s.allIn = false;
    s.streetBet = 0;
    s.handBet = 0;
    s.acted = false;
  }
  t.dealer = nextIndex(t, t.dealer < 0 ? t.seats.length - 1 : t.dealer, (s) => !s.busted);
  const headsUp = liveSeats(t).length === 2;
  const sb = headsUp ? t.dealer : nextIndex(t, t.dealer, (s) => !s.busted);
  const bb = nextIndex(t, sb, (s) => !s.busted);
  commit(t, t.seats[sb], t.smallBlind);
  commit(t, t.seats[bb], t.bigBlind);
  t.log.push(`${t.seats[sb].name} posts ${t.smallBlind}, ${t.seats[bb].name} posts ${t.bigBlind}`);
  for (let round = 0; round < 2; round++) for (const s of t.seats) if (!s.busted) s.hole.push(t.deck.pop()!);
  t.street = "preflop";
  t.currentBet = t.bigBlind;
  t.minRaise = t.bigBlind;
  t.toAct = nextIndex(t, bb, canAct);
  settleIfNoAction(t);
}

export interface LegalActions {
  toCall: number;
  canCheck: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  canRaise: boolean;
}

export function legalActions(t: PokerTable): LegalActions | null {
  if (t.toAct < 0) return null;
  const s = t.seats[t.toAct];
  const toCall = Math.min(t.currentBet - s.streetBet, s.stack);
  const maxRaiseTo = s.streetBet + s.stack;
  const minRaiseTo = Math.min(t.currentBet + t.minRaise, maxRaiseTo);
  // A short all-in does not reopen the betting for players who already acted.
  const othersCanRespond = t.seats.some((o) => o !== s && canAct(o));
  return {
    toCall,
    canCheck: toCall === 0,
    minRaiseTo,
    maxRaiseTo,
    canRaise: maxRaiseTo > t.currentBet && othersCanRespond && !s.acted,
  };
}

/** Apply the acting seat's move. Returns false and changes nothing if the move is not legal. */
export function act(t: PokerTable, seatId: string, action: PokerAction): boolean {
  if (t.toAct < 0) return false;
  const s = t.seats[t.toAct];
  if (s.id !== seatId) return false;
  const legal = legalActions(t)!;

  switch (action.type) {
    case "fold":
      s.folded = true;
      t.log.push(`${s.name} folds`);
      break;
    case "check":
      if (!legal.canCheck) return false;
      t.log.push(`${s.name} checks`);
      break;
    case "call":
      if (legal.toCall === 0) return act(t, seatId, { type: "check" });
      commit(t, s, legal.toCall);
      t.log.push(`${s.name} calls ${legal.toCall}${s.allIn ? " (all in)" : ""}`);
      break;
    case "raise": {
      if (!legal.canRaise) return false;
      const to = Math.min(Math.floor(action.to), legal.maxRaiseTo);
      if (to < legal.minRaiseTo) return false;
      const raiseBy = to - t.currentBet;
      commit(t, s, to - s.streetBet);
      // Only a full raise resets who still needs to act; a short all-in does not.
      if (raiseBy >= t.minRaise) {
        t.minRaise = raiseBy;
        for (const o of t.seats) if (o !== s) o.acted = false;
      }
      t.currentBet = Math.max(t.currentBet, to);
      t.log.push(`${s.name} raises to ${to}${s.allIn ? " (all in)" : ""}`);
      break;
    }
  }
  s.acted = true;
  advance(t);
  return true;
}

function bettingDone(t: PokerTable): boolean {
  const contenders = t.seats.filter(inHand);
  if (contenders.length <= 1) return true;
  return t.seats.filter(canAct).every((s) => s.acted && s.streetBet === t.currentBet);
}

function advance(t: PokerTable): void {
  if (t.seats.filter(inHand).length <= 1) {
    t.street = "showdown";
    t.toAct = -1;
    return;
  }
  if (!bettingDone(t)) {
    t.toAct = nextIndex(t, t.toAct, (s) => canAct(s) && (!s.acted || s.streetBet < t.currentBet));
    return;
  }
  nextStreet(t);
}

function nextStreet(t: PokerTable): void {
  for (const s of t.seats) {
    s.streetBet = 0;
    s.acted = false;
  }
  t.currentBet = 0;
  t.minRaise = t.bigBlind;
  if (t.street === "preflop") {
    t.board.push(t.deck.pop()!, t.deck.pop()!, t.deck.pop()!);
    t.street = "flop";
  } else if (t.street === "flop") {
    t.board.push(t.deck.pop()!);
    t.street = "turn";
  } else if (t.street === "turn") {
    t.board.push(t.deck.pop()!);
    t.street = "river";
  } else {
    t.street = "showdown";
    t.toAct = -1;
    return;
  }
  t.toAct = nextIndex(t, t.dealer, canAct);
  settleIfNoAction(t);
}

/** With at most one player able to bet, deal the rest of the board out. */
function settleIfNoAction(t: PokerTable): void {
  const actors = t.seats.filter(canAct);
  const contenders = t.seats.filter(inHand);
  if (contenders.length <= 1) {
    t.street = "showdown";
    t.toAct = -1;
    return;
  }
  if (actors.length === 0 || (actors.length === 1 && actors[0].streetBet >= t.currentBet)) {
    while (t.street !== "showdown") nextStreet(t);
  }
}

/** Award the pot, including side pots, once the hand reaches showdown. */
export function finishHand(t: PokerTable): HandResult {
  if (t.street !== "showdown") throw new Error("Hand is still in progress");
  const contenders = t.seats.filter(inHand);
  const won = new Map<string, number>();
  const handName = new Map<string, string>();
  const shown: Record<string, PokerCard[]> = {};

  if (contenders.length === 1) {
    const total = t.seats.reduce((sum, s) => sum + s.handBet, 0);
    won.set(contenders[0].id, total);
  } else {
    const scores = new Map(contenders.map((s) => [s.id, scoreHand([...s.hole, ...t.board])]));
    for (const s of contenders) {
      shown[s.id] = s.hole;
      handName.set(s.id, HAND_NAMES[scores.get(s.id)![0]]);
    }
    const levels = [...new Set(t.seats.map((s) => s.handBet).filter((b) => b > 0))].sort((a, b) => a - b);
    let floor = 0;
    for (const level of levels) {
      const pot = t.seats.reduce((sum, s) => sum + Math.max(0, Math.min(s.handBet, level) - floor), 0);
      const eligible = contenders.filter((s) => s.handBet >= level);
      floor = level;
      if (pot === 0 || eligible.length === 0) continue;
      let best: Seat[] = [];
      for (const s of eligible) {
        const cmp = best.length === 0 ? 1 : compareScores(scores.get(s.id)!, scores.get(best[0].id)!);
        if (cmp > 0) best = [s];
        else if (cmp === 0) best.push(s);
      }
      const share = Math.floor(pot / best.length);
      let remainder = pot - share * best.length;
      // Odd chips go to the first winners left of the dealer.
      const ordered = [...best].sort(
        (a, b) => seatDistance(t, t.seats.indexOf(a)) - seatDistance(t, t.seats.indexOf(b)),
      );
      for (const s of ordered) {
        const extra = remainder > 0 ? 1 : 0;
        remainder -= extra;
        won.set(s.id, (won.get(s.id) ?? 0) + share + extra);
      }
    }
  }

  for (const s of t.seats) {
    s.stack += won.get(s.id) ?? 0;
    if (s.stack === 0) s.busted = true;
  }
  t.toAct = -1;
  t.handOpen = false;
  return {
    winners: [...won.entries()].map(([id, amount]) => ({ id, amount, hand: handName.get(id) ?? "Uncontested" })),
    shown,
  };
}

function seatDistance(t: PokerTable, index: number): number {
  return (index - t.dealer + t.seats.length) % t.seats.length || t.seats.length;
}

/**
 * Final chip counts by seat id. A hand still open when the table closes is
 * void: everyone gets back what they put in. Always sums to the starting chips.
 */
export function chipCounts(t: PokerTable): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of t.seats) counts[s.id] = s.stack + (t.handOpen ? s.handBet : 0);
  return counts;
}

export function potSize(t: PokerTable): number {
  return t.seats.reduce((sum, s) => sum + s.handBet, 0);
}
