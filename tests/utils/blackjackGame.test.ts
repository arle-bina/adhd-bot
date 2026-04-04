import { describe, it, expect } from "vitest";
import {
  createShoe,
  draw,
  handTotal,
  isBlackjack,
  dealerHits,
  cardLabel,
  type Card,
} from "../../src/utils/blackjackGame.js";

const S = "♠" as const;
const H = "♥" as const;

function c(rank: Card["rank"], suit: Card["suit"] = S): Card {
  return { rank, suit };
}

describe("blackjackGame", () => {
  describe("cardLabel", () => {
    it("formats tens without extra width issues", () => {
      expect(cardLabel(c("10", H))).toBe("10♥");
      expect(cardLabel(c("A", S))).toBe("A♠");
    });
  });

  describe("handTotal", () => {
    it("counts face cards as 10", () => {
      expect(handTotal([c("J"), c("K")])).toBe(20);
    });

    it("treats ace as 11 when it keeps the hand ≤ 21", () => {
      expect(handTotal([c("A"), c("9")])).toBe(20);
      expect(handTotal([c("A"), c("8")])).toBe(19);
    });

    it("uses multiple aces sensibly", () => {
      expect(handTotal([c("A"), c("A"), c("9")])).toBe(21);
      expect(handTotal([c("A"), c("A"), c("K")])).toBe(12);
    });

    it("can exceed 21 on a bust", () => {
      expect(handTotal([c("10"), c("5"), c("9")])).toBe(24);
    });
  });

  describe("isBlackjack", () => {
    it("is true only for two-card 21", () => {
      expect(isBlackjack([c("A"), c("K")])).toBe(true);
      expect(isBlackjack([c("10"), c("A")])).toBe(true);
      expect(isBlackjack([c("A"), c("5"), c("5")])).toBe(false);
    });
  });

  describe("dealerHits", () => {
    it("hits on 16 and below", () => {
      expect(dealerHits([c("10"), c("6")])).toBe(true);
    });

    it("stands on hard 17 and soft 17", () => {
      expect(dealerHits([c("10"), c("7")])).toBe(false);
      expect(dealerHits([c("A"), c("6")])).toBe(false);
    });
  });

  describe("createShoe / draw", () => {
    it("creates a 6-deck shoe", () => {
      const shoe = createShoe(6);
      expect(shoe.length).toBe(52 * 6);
    });

    it("draw throws when the shoe is empty", () => {
      const shoe: Card[] = [];
      expect(() => draw(shoe)).toThrow(/Shoe exhausted/);
    });
  });
});
