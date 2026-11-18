import { describe, expect, it } from "vitest";
import { COUNTRY_NAMES, COUNTRY_FLAG, COUNTRY_COLORS, EXCHANGE_LABELS, formatElectionType, formatOfficeType, raceEmoji } from "../../src/utils/formatting.js";
import { currencyFor, formatCurrency, formatSharePrice, CURRENCY_CHOICES, EXCHANGE_CURRENCY } from "../../src/utils/currency.js";
import { resolveRole } from "../../src/utils/roles.js";
import { data as election } from "../../src/commands/election.js";
import { data as stockChart } from "../../src/commands/stock-chart.js";

describe("Canadian country parity", () => {
  it("formats Canadian identity and country-aware offices", () => {
    expect(COUNTRY_NAMES.CA).toBe("Canada");
    expect(COUNTRY_FLAG.CA).toBe("🇨🇦");
    expect(COUNTRY_COLORS.CA).toBeTypeOf("number");
    expect(raceEmoji("premier", "CA")).toBe("🇨🇦");
    expect(raceEmoji("primeMinister", "CA")).toBe("🇨🇦");
    expect(formatOfficeType("caCommons")).toBe("MP");
    expect(formatOfficeType("governor", "CA")).toBe("Premier");
    expect(formatElectionType("governor", "CA")).toBe("Premier");
    expect(formatElectionType("governor", "US")).toBe("Governor");
    expect(formatOfficeType("provincialLegislature")).toBe("Member of the Provincial Legislature");
    expect(formatElectionType("snap_caCommons")).toBe("Snap House of Commons");
    expect(resolveRole("country:CA", { partyName: "Independent", partyColor: null } as never)?.name).toBe("Canada");
  });
  it("keeps Canadian dollars distinct from US dollars and exposes the TSX", () => {
    expect(currencyFor("CA")).toBe("CAD");
    expect(currencyFor("ca")).toBe("CAD");
    expect(currencyFor("US")).toBe("USD");
    expect(formatCurrency(1234, "CAD")).toBe("C$1,234");
    expect(formatSharePrice(12.5, "CAD")).toBe("C$12.50");
    expect(EXCHANGE_CURRENCY.tsx).toBe("CAD");
    expect(EXCHANGE_LABELS.tsx).toBe("TSX");
    expect(CURRENCY_CHOICES).toContainEqual({ name: "CAD (C$)", value: "CAD" });
  });
  it("registers Canadian snap and exchange options without exceeding Discord limits", () => {
    for (const command of [election, stockChart]) {
      for (const option of command.toJSON().options ?? []) {
        if ("choices" in option) expect(option.choices?.length ?? 0).toBeLessThanOrEqual(25);
      }
    }
    const race = election.toJSON().options?.find(o => o.name === "race");
    expect(race && "choices" in race && race.choices).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "snap_caCommons" }),
      expect.objectContaining({ name: "Governor / Premier (CA)", value: "governor" }),
    ]));
    const country = stockChart.toJSON().options?.find(o => o.name === "country");
    expect(country && "choices" in country && country.choices).toContainEqual({ name: "Canada (TSX)", value: "ca" });
  });
});
