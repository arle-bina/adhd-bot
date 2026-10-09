import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/utils/api-base.js";
import { casinoRefusal, money, signedMoney } from "../../src/utils/casino.js";

describe("casino money", () => {
  it("uses a symbol when there is one and the code when there is not", () => {
    expect(money(1234.9, "USD")).toBe("$1,234");
    expect(money(5000, "FRF")).toBe("5,000 FRF");
    expect(signedMoney(-50, "GBP")).toBe("-£50");
    expect(signedMoney(0, "USD")).toBe("$0");
  });
});

describe("casinoRefusal", () => {
  const refusal = (status: number, body: object) =>
    casinoRefusal(new ApiError(status, "/api/discord-bot/casino/play", JSON.stringify(body)));

  it("prefers the server's message and adds the table limit", () => {
    expect(refusal(402, { error: "Insufficient funds", message: "You do not have 5,000 USD on hand." })).toBe(
      "You do not have 5,000 USD on hand.",
    );
    expect(refusal(400, { error: "Stake is over the table limit", currency: "USD", maxStake: 7_600_000, maxPayout: 1 })).toBe(
      "Stake is over the table limit.\nTable limit: $7,600,000 per stake.",
    );
  });

  it("points unlinked players at the site", () => {
    expect(refusal(404, { error: "No user found with that Discord ID" })).toMatch(/Link your Discord account/);
  });

  it("leaves unexpected failures to the standard error path", () => {
    expect(refusal(500, { error: "boom" })).toBeNull();
    expect(casinoRefusal(new ApiError(409, "/x", "not json"))).toBeNull();
    expect(casinoRefusal(new Error("x"))).toBeNull();
  });
});
