# Forex-Aware Discord Bot

**Date:** 2026-04-15
**Status:** Design approved, pending implementation

## Problem

Every monetary value in the Discord bot is hardcoded with `$` and formatted as USD. The game now supports five currencies (USD, GBP, JPY, CAD, EUR) with per-country corporations and multi-currency character wallets. Displaying a Japanese corporation's revenue as `$12,500` when it should be `¥12,500` is actively misleading. Cross-country aggregation commands sum values across currencies without conversion.

## Scope

1. Add shared currency infrastructure to the bot (mapping, formatting, conversion)
2. Update game API discord-bot routes to return `countryId` where missing
3. Update all economy commands to display values in the correct local currency
4. Add currency selector to cross-country aggregation commands
5. Add new `/forex` command showing exchange rates and a 48-hour performance chart

## Out of Scope

- Player `displayCurrencyPreference` support (bot always uses entity local currency or user-selected currency)
- `/leaderboard` funds metric (ranking, not financial display)
- Forex trading via Discord (already available on the website)

---

## 1. Shared Currency Infrastructure

### New file: `src/utils/currency.ts`

**Constants:**

```ts
const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD", UK: "GBP", JP: "JPY", CA: "CAD", DE: "EUR"
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", GBP: "\u00a3", JPY: "\u00a5", CAD: "C$", EUR: "\u20ac"
};

// For discord.js addChoices()
const CURRENCY_CHOICES = [
  { name: "USD ($)", value: "USD" },
  { name: "GBP (\u00a3)", value: "GBP" },
  { name: "JPY (\u00a5)", value: "JPY" },
  { name: "CAD (C$)", value: "CAD" },
  { name: "EUR (\u20ac)", value: "EUR" },
];
```

**Functions:**

| Function | Signature | Purpose |
|----------|-----------|---------|
| `currencyFor` | `(countryId: string) => string` | Map countryId to currency code |
| `symbolFor` | `(currencyCode: string) => string` | Map currency code to symbol |
| `formatCurrency` | `(amount: number, currencyCode: string) => string` | Format with symbol, no decimals (JPY uses no decimals, others use 0) |
| `formatSharePrice` | `(amount: number, currencyCode: string) => string` | Format with 2 decimal places |
| `formatCurrencySigned` | `(amount: number, currencyCode: string) => string` | Prefix +/- for income displays |
| `fetchForexRates` | `() => Promise<Record<string, number>>` | GET `/api/forex/rates`, cache 60s |
| `convertCurrency` | `(amount: number, from: string, to: string, rates: Record<string, number>) => number` | Convert using rates (both rates are "local per 1 INT") |

**Conversion math:** Rates are stored as "local currency per 1 internal unit." To convert from currency A to currency B: `amount / rates[A] * rates[B]`.

**Rate caching:** `fetchForexRates()` stores the last result and timestamp. If called within 60 seconds, returns cached. This prevents multiple commands in quick succession from hammering the API.

---

## 2. Game API Changes (A House Divided)

Add `countryId` to discord-bot API responses where it's fetched internally but not returned:

| Route | Field to Add | Source |
|-------|-------------|--------|
| `/api/discord-bot/corporation` | `countryId` on corporation object | `corporation.countryId` (already fetched) |
| `/api/discord-bot/financials` | `countryId` on corporation object | `corporation.countryId` (already fetched) |
| `/api/discord-bot/bonds` | `countryId` per bond entry | Join from corporation collection |
| `/api/discord-bot/sectors` | `countryId` per sector entry | Derive from `state.countryId` via state lookup |
| `/api/discord-bot/marketshare` | `countryId` per company entry | Join from corporation collection |
| `/api/discord-bot/stock-chart` | `countryId` on corp metadata | `corporation.countryId` (already fetched) |
| `/api/discord-bot/blackjack/balance` | `countryId` on response | `character.countryId` (already fetched) |

The `/api/discord-bot/lookup` route already returns `countryId` on characters — no change needed.

### Bot-side type updates (`src/utils/api-economy.ts`)

Add `countryId: string` to:
- `CorporationData`
- `BondEntry`
- `FinancialsResponse.corporation`
- `StockChartCorpResponse.corporation`
- `OwnedSector` and `UnownedSector`
- `MarketShareCompany`

Add `countryId: string` to `BlackjackBalanceResponse` in `api-game.ts`.

---

## 3. Single-Entity Commands (local currency)

These commands display one entity. Format all monetary values using that entity's home currency.

### `/corporation`

- Source: `corporation.countryId` from API response
- Replace local `currency()`, `price()`, `incomePrefix()`, `padDollar()` with imports from `currency.ts`
- All calls pass the corporation's currency code
- Applies to: Overview embed (liquidCapital, sharePrice, marketCap, revenue, costs, income, dividends), Bonds tab (marketPrice, totalIssued, totalOutstandingDebt), Financials tab (all income statement and balance sheet values), Share structure (sharePrice, marketCap, shareholder values), Sector breakdown (revenue, profit)

### `/profile`

- Source: `character.countryId` from lookup response (already returned)
- Update funds display: `formatCurrency(char.funds, currencyFor(char.countryId))`
- Update portfolio value display similarly

### `/investor`

- Source: `character.countryId` from lookup response
- Update portfolioValue display

### `/blackjack`

- Source: `countryId` from balance response (new field)
- Update all wager, payout, cash before/after displays
- Prize pool remains in generic "LC" denomination (it's a cross-currency pool)

### `/market`

- Map exchange to currency: `{ nyse: "USD", ftse: "GBP", nikkei: "JPY", tsx: "CAD", dax: "EUR" }`
- Use exchange's currency for price displays

### `/stock-chart` (corp mode)

- Source: `corporation.countryId` from response (new field)
- Format sharePrice/marketCap in corp's currency
- Chart Y-axis label includes currency symbol

---

## 4. Cross-Country Commands (currency selector)

These commands mix entities from multiple countries. Add a `currency` string option to each:

```ts
.addStringOption(opt => opt
  .setName("currency")
  .setDescription("Display currency (default: USD)")
  .setRequired(false)
  .addChoices(...CURRENCY_CHOICES))
```

When a currency is selected, fetch forex rates and convert all values before display. Add embed footer: `"Values shown in {SYMBOL} {CODE}"`.

### `/corpcompare`

- Each corp has its own `countryId`
- Convert all metrics (marketCap, revenue, income, liquidCapital, sharePrice) to the selected currency
- Default: USD

### `/stockpick`

- Stock listings span countries
- Convert sharePrice, income, marketCap to selected currency
- Default: USD

### `/sectors`

- Sector entries span countries
- Convert revenue, unownedRevenue, totalMarket to selected currency
- Default: USD

### `/marketshare`

- Companies span countries (scope.country may filter to one)
- Convert revenue, totalMarket, unownedRevenue to selected currency
- Default: USD
- When scope is filtered to a single country, default to that country's currency instead of USD

---

## 5. New `/forex` Command

### Command Definition

```ts
new SlashCommandBuilder()
  .setName("forex")
  .setDescription("View currency exchange rates and 48-hour performance")
```

No arguments — always shows all active currencies.

### Data Source

`GET /api/forex/exchange` (public, no auth needed) returns:
```ts
{
  rates: Array<{
    countryId: string;
    currencyCode: string;
    rate: number;          // current rate (local per 1 INT)
    baseRate: number;
    macroTarget: number;
    buyVolume24: number;
    sellVolume24: number;
    rateHistory: Array<{ turn: number; rate: number }>  // last 48 turns
  }>;
  orderBook: [...];  // not used for this command
}
```

### Embed Layout

**Title:** "Currency Exchange Rates"
**Color:** `0x5865F2` (Discord blurple)

**Rate Table** (code block for alignment):
```
Currency  |  Rate/INT  |  48h Change
USD ($)   |   1.0000   |    +0.3%
GBP (£)   |   0.7500   |    -0.8%
JPY (¥)   | 106.0000   |    +1.2%
```

**Volume fields** (inline):
- Per currency: "Buy: X / Sell: Y" over 24 turns

**Footer:** "1 INT = listed rate in local currency | Updated every turn"

### Chart (attached as PNG)

- **Generator:** New function `generateForexChart()` in `src/utils/chartGenerator.ts`
- **Library:** `chartjs-node-canvas` (already a dependency, already used by `/market` and `/stock-chart`)
- **Canvas:** Same `ChartJSNodeCanvas` instance (800x400, `#2f3136` background)
- **Data:** Normalize each currency's `rateHistory` to % change from first point (same approach as game's `RateChart` component)
- **Y-axis:** % change from start, labeled `"Change %"`
- **X-axis:** Turn numbers from `rateHistory[].turn`
- **One line per active currency**

**Colorblind-safe palette (Wong palette):**

| Currency | Color | Hex |
|----------|-------|-----|
| USD | Blue | `#4477AA` |
| GBP | Rose | `#EE6677` |
| JPY | Green | `#228833` |
| CAD | Yellow | `#CCBB44` |
| EUR | Purple | `#AA3377` |

- Lines use `borderWidth: 2.5` for visibility
- Legend uses currency code + symbol labels (e.g., "USD ($)")
- `pointRadius: 0` for clean lines (48 points is dense enough)
- Zero line drawn with a subtle dashed line at y=0

---

## 6. File Change Summary

### A House Divided (game API)

| File | Change |
|------|--------|
| `src/app/api/discord-bot/corporation/route.ts` | Add `countryId` to response |
| `src/app/api/discord-bot/financials/route.ts` | Add `countryId` to corporation object |
| `src/app/api/discord-bot/bonds/route.ts` | Add `countryId` per bond from corp lookup |
| `src/app/api/discord-bot/sectors/route.ts` | Add `countryId` per sector from state |
| `src/app/api/discord-bot/marketshare/route.ts` | Add `countryId` per company from corp |
| `src/app/api/discord-bot/stock-chart/route.ts` | Add `countryId` to corp metadata |
| `src/app/api/discord-bot/blackjack/balance/route.ts` | Add `countryId` to response |

### ADHD Bot (Discord bot)

| File | Change |
|------|--------|
| `src/utils/currency.ts` | **NEW** — currency constants, formatting, rate fetching, conversion |
| `src/utils/api-economy.ts` | Add `countryId` to interfaces |
| `src/utils/api-game.ts` | Add `countryId` to `BlackjackBalanceResponse` |
| `src/utils/formatting.ts` | Add `EXCHANGE_CURRENCY` map |
| `src/utils/chartGenerator.ts` | Add `generateForexChart()` function |
| `src/commands/corporation.ts` | Replace local formatters with `currency.ts` imports, use corp countryId |
| `src/commands/corpcompare.ts` | Replace local formatters, add currency option + conversion |
| `src/commands/bonds.ts` | Use bond's countryId for formatting |
| `src/commands/stockpick.ts` | Replace local formatter, add currency option + conversion |
| `src/commands/sectors.ts` | Add currency option + conversion |
| `src/commands/marketshare.ts` | Add currency option + conversion |
| `src/commands/profile.ts` | Use character countryId for funds/portfolio |
| `src/commands/investor.ts` | Use character countryId for portfolio value |
| `src/commands/blackjack.ts` | Use character countryId for all cash displays |
| `src/commands/market.ts` | Use exchange → currency mapping |
| `src/commands/stock-chart.ts` | Use corp countryId for formatting |
| `src/commands/forex.ts` | **NEW** — `/forex` command with rate table + chart |

---

## 7. Testing Considerations

- Verify `convertCurrency` math: USD→GBP, JPY→USD, same-currency no-op
- Verify `formatCurrency` handles JPY (no decimals, large numbers) vs GBP/USD correctly
- Verify rate cache expiry works (doesn't serve stale data past 60s)
- Manual test each command with a known non-US corporation to confirm correct symbol appears
- Manual test `/corpcompare` with corps from different countries + currency selector
- Manual test `/forex` chart renders with all currencies visible and distinguishable
