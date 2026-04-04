/** Single-shoe blackjack helpers (standard US rules: dealer stands on soft 17). */

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export interface Card {
  rank: Rank;
  suit: Suit;
}

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** Build and shuffle a multi-deck shoe (default 6 decks). */
export function createShoe(decks = 6): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ rank, suit });
      }
    }
  }
  shuffleInPlace(shoe);
  return shoe;
}

export function cardLabel(c: Card): string {
  const r = c.rank === "10" ? "10" : c.rank;
  return `${r}${c.suit}`;
}

/** Best total ≤ 21; may exceed 21 if hand is a bust. */
export function handTotal(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === "A") {
      aces++;
    } else if (c.rank === "J" || c.rank === "Q" || c.rank === "K" || c.rank === "10") {
      total += 10;
    } else {
      total += parseInt(c.rank, 10);
    }
  }
  total += aces;
  for (let i = 0; i < aces; i++) {
    if (total + 10 <= 21) {
      total += 10;
    }
  }
  return total;
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards) === 21;
}

/** Dealer stands on all 17s (including soft 17). */
export function dealerHits(cards: Card[]): boolean {
  return handTotal(cards) < 17;
}

export function draw(shoe: Card[]): Card {
  const c = shoe.pop();
  if (!c) {
    throw new Error("Shoe exhausted — this should not happen in a single hand.");
  }
  return c;
}
