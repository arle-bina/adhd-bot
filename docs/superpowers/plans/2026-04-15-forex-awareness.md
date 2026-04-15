# Forex-Aware Discord Bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update all Discord bot economy commands to display monetary values in the correct local currency, add currency conversion for cross-country commands, and add a new `/forex` command.

**Architecture:** Bot derives currency from `countryId` using a local mapping. Game API routes are updated to return `countryId` where missing. Cross-country commands fetch forex rates and convert to a user-selected currency. A new `/forex` command shows rates + a 48h performance chart.

**Tech Stack:** TypeScript, discord.js v14, chartjs-node-canvas, Next.js API routes (game server)

**Spec:** `docs/superpowers/specs/2026-04-15-forex-awareness-design.md`

**Two repos involved:**
- **Game API:** `C:\Users\novad\ProgramProjects\A House Divided` (branch: `jp-pm-nomination-bug` or feature branch off development)
- **Discord Bot:** `C:\Users\novad\ProgramProjects\ADHD Bot` (branch: `jp-updates`)

---

## File Map

### Game API (A House Divided) — modify only

| File | Change |
|------|--------|
| `src/app/api/discord-bot/corporation/route.ts` | Add `countryId` to corporation response object |
| `src/app/api/discord-bot/financials/route.ts` | Add `countryId` to corporation response object |
| `src/app/api/discord-bot/bonds/route.ts` | Add `countryId` to corp projection + bond response |
| `src/app/api/discord-bot/sectors/route.ts` | Add `countryId` to corp projection + sector response |
| `src/app/api/discord-bot/marketshare/route.ts` | Add `countryId` to corp projection + company response |
| `src/app/api/discord-bot/stock-chart/route.ts` | Add `countryId` to corp response object |
| `src/app/api/discord-bot/blackjack/balance/route.ts` | Add `countryId` to balance response |

### Discord Bot (ADHD Bot) — create and modify

| File | Change |
|------|--------|
| `src/utils/currency.ts` | **CREATE** — constants, formatting, rate fetching, conversion |
| `src/utils/api-economy.ts` | Add `countryId` to interfaces |
| `src/utils/api-game.ts` | Add `countryId` to `BlackjackBalanceResponse` |
| `src/utils/formatting.ts` | Add `EXCHANGE_CURRENCY` map |
| `src/utils/chartGenerator.ts` | Add `generateForexChart()` function |
| `src/commands/corporation.ts` | Replace local formatters with currency.ts, use corp countryId |
| `src/commands/corpcompare.ts` | Replace local formatters, add currency option + conversion |
| `src/commands/bonds.ts` | Use bond countryId for formatting |
| `src/commands/stockpick.ts` | Replace local formatter, add currency option + conversion |
| `src/commands/sectors.ts` | Add currency option + conversion |
| `src/commands/marketshare.ts` | Add currency option + conversion |
| `src/commands/profile.ts` | Use character countryId for funds/portfolio |
| `src/commands/investor.ts` | Use character countryId for portfolio value |
| `src/commands/blackjack.ts` | Use character countryId for cash displays |
| `src/commands/market.ts` | Use exchange → currency mapping |
| `src/commands/stock-chart.ts` | Use corp countryId for formatting |
| `src/commands/forex.ts` | **CREATE** — new `/forex` command |

---

## Task 1: Game API — Add countryId to discord-bot responses

**Repo:** A House Divided (`C:\Users\novad\ProgramProjects\A House Divided`)

**Files:**
- Modify: `src/app/api/discord-bot/corporation/route.ts`
- Modify: `src/app/api/discord-bot/financials/route.ts`
- Modify: `src/app/api/discord-bot/bonds/route.ts`
- Modify: `src/app/api/discord-bot/sectors/route.ts`
- Modify: `src/app/api/discord-bot/marketshare/route.ts`
- Modify: `src/app/api/discord-bot/stock-chart/route.ts`
- Modify: `src/app/api/discord-bot/blackjack/balance/route.ts`

- [ ] **Step 1: corporation/route.ts — add countryId to corporation object**

In the response JSON `corporation` object, add `countryId` after `corpUrl`. The variable `corporation.countryId` is already available (used at line ~242).

Find this in the corporation response object:
```ts
          corpUrl,
        },
```
Change to:
```ts
          corpUrl,
          countryId: corporation.countryId,
        },
```

- [ ] **Step 2: financials/route.ts — add countryId to corporation object**

In the response JSON `corporation` object, add `countryId` after `corpUrl`. The variable `corporation.countryId` is already available (used at line ~270).

Find this in the corporation response object:
```ts
          corpUrl,
        },
```
Change to:
```ts
          corpUrl,
          countryId: corporation.countryId,
        },
```

- [ ] **Step 3: bonds/route.ts — add countryId to projection and bond response**

First, add `countryId: 1` to the corporation projection. Find the project call on the corporations collection:

```ts
      .project<{ _id: ObjectId; name: string; sequentialId?: number; brandColor?: string; }>
```
Change to:
```ts
      .project<{ _id: ObjectId; name: string; sequentialId?: number; brandColor?: string; countryId?: string; }>
```

Then add `countryId` to the projection object parameter:
```ts
      ({ _id: 1, name: 1, sequentialId: 1, brandColor: 1 })
```
Change to:
```ts
      ({ _id: 1, name: 1, sequentialId: 1, brandColor: 1, countryId: 1 })
```

Then in the bond response mapping, add `countryId` after `brandColor`:
```ts
        brandColor: corp?.brandColor ?? null,
        couponRate: bond.couponRate,
```
Change to:
```ts
        brandColor: corp?.brandColor ?? null,
        countryId: corp?.countryId ?? null,
        couponRate: bond.couponRate,
```

- [ ] **Step 4: sectors/route.ts — add countryId to projection and sector response**

First, add `countryId: 1` to the corporation projection in owned mode. Find the project type and object:

```ts
      .project<{ _id: import("mongodb").ObjectId; name: string; brandColor?: string; sequentialId?: number; }>({ _id: 1, name: 1, brandColor: 1, sequentialId: 1 })
```
Change to:
```ts
      .project<{ _id: import("mongodb").ObjectId; name: string; brandColor?: string; sequentialId?: number; countryId?: string; }>({ _id: 1, name: 1, brandColor: 1, sequentialId: 1, countryId: 1 })
```

Then in the owned-mode sector response mapping, add `countryId` after `brandColor`:
```ts
        brandColor: corp?.brandColor ?? null,
        corporationSequentialId: corp?.sequentialId ?? null,
```
Change to:
```ts
        brandColor: corp?.brandColor ?? null,
        countryId: corp?.countryId ?? null,
        corporationSequentialId: corp?.sequentialId ?? null,
```

For unowned mode, the state's `countryId` must be added. Find the unowned sectors response mapping and add `countryId` from the state data. Look for where unowned sector objects are built (they have `stateId`, `stateName`, `unownedRevenue`, `totalMarket`). Add `countryId` derived from the state:
```ts
        stateName: state?.name ?? s._id,
```
Add after:
```ts
        countryId: state?.countryId ?? null,
```

(Verify the state object has `countryId` — it should since states belong to countries.)

- [ ] **Step 5: marketshare/route.ts — add countryId to projection and company response**

Add `countryId: 1` to the corporation projection. Find:
```ts
      ({ _id: 1, name: 1, sequentialId: 1, brandColor: 1, countryOwnerId: 1 })
```
Change to:
```ts
      ({ _id: 1, name: 1, sequentialId: 1, brandColor: 1, countryOwnerId: 1, countryId: 1 })
```

Also update the project type generic to include `countryId`:
```ts
      .project<{ _id: import("mongodb").ObjectId; name: string; sequentialId?: number; brandColor?: string; countryOwnerId?: CountryId; }>
```
Change to:
```ts
      .project<{ _id: import("mongodb").ObjectId; name: string; sequentialId?: number; brandColor?: string; countryOwnerId?: CountryId; countryId?: string; }>
```

Update the `Row` type:
```ts
    type Row = {
      corporationId: string;
      corporationName: string;
      corporationSequentialId: number | null;
      brandColor: string | null;
      revenue: number;
      marketSharePercent: number;
      isNatcorp: boolean;
    };
```
Change to:
```ts
    type Row = {
      corporationId: string;
      corporationName: string;
      corporationSequentialId: number | null;
      brandColor: string | null;
      countryId: string | null;
      revenue: number;
      marketSharePercent: number;
      isNatcorp: boolean;
    };
```

Add `countryId` in the company push:
```ts
        brandColor: corp?.brandColor ?? null,
        revenue: raw,
```
Change to:
```ts
        brandColor: corp?.brandColor ?? null,
        countryId: corp?.countryId ?? null,
        revenue: raw,
```

- [ ] **Step 6: stock-chart/route.ts — add countryId to corp metadata**

In the corporation mode response, add `countryId` to the corporation object:
```ts
        corporation: {
          name: corporation.name,
          sequentialId: corporation.sequentialId,
          type: corporation.type,
        },
```
Change to:
```ts
        corporation: {
          name: corporation.name,
          sequentialId: corporation.sequentialId,
          type: corporation.type,
          countryId: corporation.countryId,
        },
```

- [ ] **Step 7: blackjack/balance/route.ts — add countryId to response**

The character object is already fetched. Add `countryId`:
```ts
    return NextResponse.json({
      success: true,
      discordId,
      characterId: character._id.toString(),
      characterName: character.name,
      cashOnHand: getTotalPersonalWealth(character, forexEnabled),
    });
```
Change to:
```ts
    return NextResponse.json({
      success: true,
      discordId,
      characterId: character._id.toString(),
      characterName: character.name,
      countryId: character.countryId,
      cashOnHand: getTotalPersonalWealth(character, forexEnabled),
    });
```

- [ ] **Step 8: Run typecheck on A House Divided**

Run: `npm run typecheck`
Expected: PASS with zero errors. All additions are adding new fields to response objects — no type conflicts.

- [ ] **Step 9: Commit game API changes**

```bash
git add src/app/api/discord-bot/
git commit -m "feat(api): add countryId to discord-bot API responses for forex awareness"
```

---

## Task 2: Bot — Currency infrastructure (`currency.ts`)

**Repo:** ADHD Bot (`C:\Users\novad\ProgramProjects\ADHD Bot`)

**Files:**
- Create: `src/utils/currency.ts`

- [ ] **Step 1: Create `src/utils/currency.ts`**

```ts
// Currency constants, formatting, and conversion for forex-aware displays.

import { apiFetchPublic } from "./api-base.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD",
  UK: "GBP",
  JP: "JPY",
  CA: "CAD",
  DE: "EUR",
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "\u00a3",
  JPY: "\u00a5",
  CAD: "C$",
  EUR: "\u20ac",
};

/** For discord.js `.addChoices()` on slash command string options. */
export const CURRENCY_CHOICES: Array<{ name: string; value: string }> = [
  { name: "USD ($)", value: "USD" },
  { name: "GBP (\u00a3)", value: "GBP" },
  { name: "JPY (\u00a5)", value: "JPY" },
  { name: "CAD (C$)", value: "CAD" },
  { name: "EUR (\u20ac)", value: "EUR" },
];

/** Maps stock exchange codes to their home currency. */
export const EXCHANGE_CURRENCY: Record<string, string> = {
  nyse: "USD",
  ftse: "GBP",
  nikkei: "JPY",
  tsx: "CAD",
  dax: "EUR",
  global: "USD",
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Map a countryId to its currency code. Falls back to "USD". */
export function currencyFor(countryId: string | null | undefined): string {
  return (countryId && COUNTRY_CURRENCY[countryId]) || "USD";
}

/** Map a currency code to its display symbol. Falls back to "$". */
export function symbolFor(currencyCode: string): string {
  return CURRENCY_SYMBOLS[currencyCode] || "$";
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Format a monetary amount with the currency symbol, no decimal places. */
export function formatCurrency(amount: number | null | undefined, currencyCode: string): string {
  const n = amount ?? 0;
  const sym = symbolFor(currencyCode);
  return sym + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Format a share price with 2 decimal places. */
export function formatSharePrice(amount: number | null | undefined, currencyCode: string): string {
  const n = amount ?? 0;
  const sym = symbolFor(currencyCode);
  return sym + n.toFixed(2);
}

/** Format a monetary amount with +/- sign prefix (for income/change displays). */
export function formatCurrencySigned(amount: number | null | undefined, currencyCode: string): string {
  const n = amount ?? 0;
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(n), currencyCode)}`;
}

/** Right-align a currency amount string to a fixed width for code blocks. */
export function padCurrency(label: string, amount: number | null | undefined, width: number, currencyCode: string): string {
  const val = formatCurrency(amount, currencyCode);
  return `${label}${val.padStart(width)}`;
}

// ---------------------------------------------------------------------------
// Forex rate fetching (cached)
// ---------------------------------------------------------------------------

interface ForexRatesResponse {
  rates: Record<string, number>;
}

let cachedRates: Record<string, number> | null = null;
let cacheExpiry = 0;
const RATE_CACHE_TTL_MS = 60_000;

/**
 * Fetch current forex rates from the game API. Cached for 60 seconds.
 * Returns a map of currencyCode → rate (local currency per 1 internal unit).
 */
export async function fetchForexRates(): Promise<Record<string, number>> {
  if (cachedRates && Date.now() < cacheExpiry) return cachedRates;

  try {
    const res = await apiFetchPublic<ForexRatesResponse>("/api/forex/rates");
    cachedRates = res.rates;
    cacheExpiry = Date.now() + RATE_CACHE_TTL_MS;
    return cachedRates;
  } catch {
    // If rates unavailable, return identity rates (everything = 1.0)
    return cachedRates ?? { USD: 1, GBP: 1, JPY: 1, CAD: 1, EUR: 1 };
  }
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Convert an amount from one currency to another using forex rates.
 * Rates are "local currency per 1 internal unit."
 * Conversion: amount / rates[from] * rates[to]
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>,
): number {
  if (fromCurrency === toCurrency) return amount;
  const fromRate = rates[fromCurrency] ?? 1;
  const toRate = rates[toCurrency] ?? 1;
  return (amount / fromRate) * toRate;
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit`
Expected: No new errors related to `currency.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/utils/currency.ts
git commit -m "feat: add currency infrastructure for forex-aware displays"
```

---

## Task 3: Bot — Update API type interfaces

**Repo:** ADHD Bot

**Files:**
- Modify: `src/utils/api-economy.ts`
- Modify: `src/utils/api-game.ts`
- Modify: `src/utils/api.ts` (barrel re-export if needed)

- [ ] **Step 1: Add countryId to CorporationData**

In `src/utils/api-economy.ts`, find `CorporationData`:
```ts
  publicFloat: number;
  publicFloatPct: number;
  dividendRate: number;
}
```
Add before the closing brace:
```ts
  publicFloat: number;
  publicFloatPct: number;
  dividendRate: number;
  countryId: string;
}
```

- [ ] **Step 2: Add countryId to BondEntry**

In `src/utils/api-economy.ts`, find `BondEntry`:
```ts
  brandColor: string | null;
  couponRate: number;
```
Add between:
```ts
  brandColor: string | null;
  countryId: string | null;
  couponRate: number;
```

- [ ] **Step 3: Add countryId to FinancialsResponse.corporation**

In `src/utils/api-economy.ts`, find the `corporation` sub-object in `FinancialsResponse`:
```ts
    corpUrl: string;
  };
```
Add before the closing:
```ts
    corpUrl: string;
    countryId: string;
  };
```

- [ ] **Step 4: Add countryId to OwnedSector and UnownedSector**

In `src/utils/api-economy.ts`, find `OwnedSector`:
```ts
export interface OwnedSector {
  corporationName: string;
  stateName: string;
  revenue: number;
```
Add `countryId`:
```ts
export interface OwnedSector {
  corporationName: string;
  stateName: string;
  countryId: string | null;
  revenue: number;
```

Find `UnownedSector`:
```ts
export interface UnownedSector {
  stateId: string;
  stateName: string;
  unownedRevenue: number;
```
Add `countryId`:
```ts
export interface UnownedSector {
  stateId: string;
  stateName: string;
  countryId: string | null;
  unownedRevenue: number;
```

- [ ] **Step 5: Add countryId to MarketShareCompany**

In `src/utils/api-economy.ts`, find `MarketShareCompany`:
```ts
  brandColor: string | null;
  revenue: number;
```
Add between:
```ts
  brandColor: string | null;
  countryId: string | null;
  revenue: number;
```

- [ ] **Step 6: Add countryId to StockChartCorpResponse**

In `src/utils/api-economy.ts`, find `StockChartCorpResponse`:
```ts
  corporation: { name: string; sequentialId: number; type: string };
```
Change to:
```ts
  corporation: { name: string; sequentialId: number; type: string; countryId: string };
```

- [ ] **Step 7: Add countryId to BlackjackBalanceResponse**

In `src/utils/api-game.ts`, find `BlackjackBalanceResponse`:
```ts
export interface BlackjackBalanceResponse {
  cashOnHand: number;
  characterName: string;
}
```
Change to:
```ts
export interface BlackjackBalanceResponse {
  cashOnHand: number;
  characterName: string;
  countryId: string;
}
```

- [ ] **Step 8: Add currency.ts exports to barrel file**

In `src/utils/api.ts`, add the currency re-exports. Find the end of the file and add:
```ts
export {
  currencyFor,
  symbolFor,
  formatCurrency,
  formatSharePrice,
  formatCurrencySigned,
  padCurrency,
  fetchForexRates,
  convertCurrency,
  COUNTRY_CURRENCY,
  CURRENCY_SYMBOLS,
  CURRENCY_CHOICES,
  EXCHANGE_CURRENCY,
} from "./currency.js";
```

- [ ] **Step 9: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 10: Commit**

```bash
git add src/utils/api-economy.ts src/utils/api-game.ts src/utils/api.ts
git commit -m "feat: add countryId to API type interfaces for forex awareness"
```

---

## Task 4: Bot — Update single-entity commands

**Repo:** ADHD Bot

**Files:**
- Modify: `src/commands/corporation.ts`
- Modify: `src/commands/profile.ts`
- Modify: `src/commands/investor.ts`
- Modify: `src/commands/blackjack.ts`
- Modify: `src/commands/market.ts`
- Modify: `src/commands/stock-chart.ts`

- [ ] **Step 1: Update `/corporation` command**

In `src/commands/corporation.ts`:

**1a.** Replace the local formatting helpers (lines 43-61) with imports. Replace:
```ts
import { hexToInt, replyWithError } from "../utils/helpers.js";
```
With:
```ts
import { hexToInt, replyWithError } from "../utils/helpers.js";
import { currencyFor, formatCurrency, formatSharePrice, formatCurrencySigned, padCurrency } from "../utils/currency.js";
```

**1b.** Delete the four local helper functions `currency()`, `price()`, `incomePrefix()`, and `padDollar()` (lines 43-61).

**1c.** In `buildOverviewEmbed()`, derive the currency code at the top of the function:
```ts
function buildOverviewEmbed(res: CorporationResponse): EmbedBuilder {
  const corp = res.corporation!;
  const cc = currencyFor(corp.countryId);
```

**1d.** Replace all `currency(...)` calls with `formatCurrency(..., cc)`, all `price(...)` calls with `formatSharePrice(..., cc)`, all `incomePrefix(...)` calls with `formatCurrencySigned(..., cc)`, and all `padDollar(...)` calls with `padCurrency(...)` adding `cc` as the last argument. Specifically:

- `currency(corp.liquidCapital)` → `formatCurrency(corp.liquidCapital, cc)`
- `price(corp.sharePrice)` → `formatSharePrice(corp.sharePrice, cc)`
- `currency(corp.marketCapitalization)` → `formatCurrency(corp.marketCapitalization, cc)`
- `currency(financials.totalRevenue)` → `formatCurrency(financials.totalRevenue, cc)`
- `currency(financials.totalCosts)` → `formatCurrency(financials.totalCosts, cc)`
- `incomePrefix(financials.income)` → `formatCurrencySigned(financials.income, cc)`
- `currency(financials.dailyDividendPayout)` → `formatCurrency(financials.dailyDividendPayout, cc)`
- `currency(totalDebt)` → `formatCurrency(totalDebt, cc)`
- `currency(corp.marketingBudget)` → `formatCurrency(corp.marketingBudget, cc)`
- `currency(s.revenue)` → `formatCurrency(s.revenue, cc)`

**1e.** In `buildBondsEmbed()`, derive currency from the first bond's countryId:
```ts
function buildBondsEmbed(res: BondsResponse, name: string): EmbedBuilder {
```
Add after the early-return check:
```ts
  const cc = res.bonds.length > 0 && res.bonds[0].countryId ? currencyFor(res.bonds[0].countryId) : "USD";
```
Then replace `price(b.marketPrice)` → `formatSharePrice(b.marketPrice, cc)`, `currency(b.totalIssued)` → `formatCurrency(b.totalIssued, cc)`, `currency(res.totalOutstandingDebt)` → `formatCurrency(res.totalOutstandingDebt, cc)`.

**1f.** In `buildFinancialsEmbed()`, derive currency:
```ts
function buildFinancialsEmbed(res: FinancialsResponse): EmbedBuilder {
  const corp = res.corporation;
  const cc = currencyFor(corp.countryId);
```
Then replace all `padDollar(label, amount, W)` → `padCurrency(label, amount, W, cc)`, `price(...)` → `formatSharePrice(..., cc)`, `currency(...)` → `formatCurrency(..., cc)`.

- [ ] **Step 2: Update `/profile` command**

In `src/commands/profile.ts`, add import:
```ts
import { currencyFor, formatCurrency } from "../utils/currency.js";
```

In `buildProfileEmbed()`, derive currency:
```ts
function buildProfileEmbed(char: CharacterResult): EmbedBuilder {
  const cc = currencyFor(char.countryId);
```

Replace the funds field (line 95):
```ts
    { name: "Funds", value: `$${Math.round(char.funds ?? 0).toLocaleString()}`, inline: true },
```
With:
```ts
    { name: "Funds", value: formatCurrency(Math.round(char.funds ?? 0), cc), inline: true },
```

Replace the portfolio value display (lines 109-111):
```ts
      ? `$${Math.round(char.portfolioValue).toLocaleString()}${rank}`
```
With:
```ts
      ? `${formatCurrency(Math.round(char.portfolioValue), cc)}${rank}`
```

- [ ] **Step 3: Update `/investor` command**

In `src/commands/investor.ts`, add import:
```ts
import { currencyFor, formatCurrency } from "../utils/currency.js";
```

In `execute()`, after getting `char`, derive currency:
```ts
    const char = result.characters[0];
    const cc = currencyFor(char.countryId);
```

Replace the portfolio value display (line 99):
```ts
        ? `$${Math.round(char.portfolioValue).toLocaleString()}`
```
With:
```ts
        ? formatCurrency(Math.round(char.portfolioValue), cc)
```

- [ ] **Step 4: Update `/blackjack` command**

In `src/commands/blackjack.ts`, add import:
```ts
import { currencyFor, formatCurrency, symbolFor } from "../utils/currency.js";
```

In `execute()`, after getting the balance, derive currency and store it:
```ts
    const bal = await getBlackjackBalance(discordId);
    characterName = bal.characterName;
    const cc = currencyFor(bal.countryId);
```

Pass `cc` into the embed builders by adding it to function signatures. For the `buildTableEmbed` and `buildResultEmbed` params, add `currencyCode: string` and use it for formatting.

In `buildTableEmbed`, replace wager display:
```ts
      { name: "Wager", value: `$${params.wager.toLocaleString()} LC`, inline: true },
```
With:
```ts
      { name: "Wager", value: `${formatCurrency(params.wager, params.currencyCode)} LC`, inline: true },
```

In `buildResultEmbed`, replace all `$${...toLocaleString()}` patterns with `formatCurrency(...)` calls using `params.currencyCode`. The key replacements:
- `$${params.wager.toLocaleString()}` → `formatCurrency(params.wager, params.currencyCode)`
- `$${amount.toLocaleString()}` → `formatCurrency(amount, params.currencyCode)`
- `$${previousCash.toLocaleString()}` → `formatCurrency(previousCash, params.currencyCode)`
- `$${newCash.toLocaleString()}` → `formatCurrency(newCash, params.currencyCode)`
- `+$${net.toLocaleString()}` → `+${formatCurrency(net, params.currencyCode)}`
- `-$${Math.abs(net).toLocaleString()}` → `-${formatCurrency(Math.abs(net), params.currencyCode)}`
- `$0` → `${symbolFor(params.currencyCode)}0`

The blackjack pool display (`sub === "pool"`) stays as-is with `$` since it's a cross-currency pool denominated in LC.

Also update the insufficient-funds message:
```ts
        content: `You only have **$${bal.cashOnHand.toLocaleString()} LC** on hand; you cannot wager **$${wager.toLocaleString()}**.`,
```
Change to:
```ts
        content: `You only have **${formatCurrency(bal.cashOnHand, cc)} LC** on hand; you cannot wager **${formatCurrency(wager, cc)}**.`,
```

- [ ] **Step 5: Update `/market` command**

In `src/commands/market.ts`, add import:
```ts
import { EXCHANGE_CURRENCY, formatCurrency } from "../utils/currency.js";
```

No major monetary display in this command currently — the chart shows prices on the Y-axis. But if the embed shows a price, use the exchange's currency. The current embed doesn't show a price field, so just add the currency label to the footer:

Find:
```ts
        footer: {
          text: `Market Data • ${marketData.exchangeName}`
        }
```
Change to:
```ts
        footer: {
          text: `Market Data • ${marketData.exchangeName} • ${EXCHANGE_CURRENCY[exchange] ?? "USD"}`
        }
```

- [ ] **Step 6: Update `/stock-chart` command**

In `src/commands/stock-chart.ts`, add import:
```ts
import { currencyFor, formatCurrency, formatSharePrice, EXCHANGE_CURRENCY } from "../utils/currency.js";
```

In the corporation mode section, derive currency from the new `countryId` field:
```ts
    } else {
      // Corporation mode
      const metric: StockChartMetric = metricRaw ?? "sharePrice";
```
Add after:
```ts
      const cc = currencyFor(res.corporation.countryId);
```

Replace the share price field:
```ts
            value: `$${latestPoint.sharePrice.toFixed(2)}`,
```
With:
```ts
            value: formatSharePrice(latestPoint.sharePrice, cc),
```

Replace the market cap field:
```ts
            value: `$${latestPoint.marketCap.toLocaleString("en-US")}`,
```
With:
```ts
            value: formatCurrency(latestPoint.marketCap, cc),
```

In the market mode section, derive currency from exchange:
```ts
      const cc = EXCHANGE_CURRENCY[res.exchange] ?? "USD";
```

Replace:
```ts
            value: `$${latestPoint.marketCap.toLocaleString("en-US")}`,
```
With:
```ts
            value: formatCurrency(latestPoint.marketCap, cc),
```

- [ ] **Step 7: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/commands/corporation.ts src/commands/profile.ts src/commands/investor.ts src/commands/blackjack.ts src/commands/market.ts src/commands/stock-chart.ts
git commit -m "feat: update single-entity commands for local currency display"
```

---

## Task 5: Bot — Update cross-country commands with currency selector

**Repo:** ADHD Bot

**Files:**
- Modify: `src/commands/corpcompare.ts`
- Modify: `src/commands/stockpick.ts`
- Modify: `src/commands/sectors.ts`
- Modify: `src/commands/marketshare.ts`
- Modify: `src/commands/bonds.ts`

- [ ] **Step 1: Update `/corpcompare`**

In `src/commands/corpcompare.ts`:

**1a.** Replace imports:
```ts
import { hexToInt, replyWithError } from "../utils/helpers.js";
```
With:
```ts
import { hexToInt, replyWithError } from "../utils/helpers.js";
import {
  currencyFor,
  formatCurrency,
  formatSharePrice,
  fetchForexRates,
  convertCurrency,
  CURRENCY_CHOICES,
} from "../utils/currency.js";
```

**1b.** Delete local `currency()` and `price()` functions (lines 44-49).

**1c.** Add the currency option to the command definition. After the last `.addStringOption` for `metric`:
```ts
  .addStringOption(o => o
    .setName("currency")
    .setDescription("Display currency for comparison (default: USD)")
    .setRequired(false)
    .addChoices(...CURRENCY_CHOICES));
```

**1d.** Update the `METRICS` array formatters to accept a currency code. Change the type and make formatters accept `(n: number, cc: string) => string`:
```ts
const METRICS: Array<{ id: string; name: string; formatter: (n: number | undefined | null, cc: string) => string }> = [
  { id: "marketCap", name: "Market Cap", formatter: formatCurrency },
  { id: "revenue", name: "Daily Revenue", formatter: formatCurrency },
  { id: "income", name: "Daily Income", formatter: formatCurrency },
  { id: "profitMargin", name: "Profit Margin", formatter: (n) => percent(n) },
  { id: "sharePrice", name: "Share Price", formatter: formatSharePrice },
  { id: "liquidCapital", name: "Liquid Capital", formatter: formatCurrency },
];
```

Note: `percent()` doesn't need currency, so wrap it to ignore the second arg.

**1e.** In `execute()`, get the selected currency and fetch rates:
```ts
    const primaryMetric = interaction.options.getString("metric") || "marketCap";
    const targetCurrency = interaction.options.getString("currency") || "USD";
```

After fetching corps, fetch rates:
```ts
    const rates = await fetchForexRates();
```

**1f.** Create a conversion helper within execute:
```ts
    const convert = (amount: number, corpCountryId: string | undefined) => {
      const fromCc = currencyFor(corpCountryId);
      return convertCurrency(amount, fromCc, targetCurrency, rates);
    };
```

**1g.** Update `getMetricValue` calls to convert values. When formatting metric values, convert first then format:
```ts
        const value = convert(values[index], corp.corporation?.countryId);
        return `${prefix}**${corp.corporation!.name}**: ${primaryMetricData.formatter(value, targetCurrency)}`;
```

**1h.** Update the embed footer to indicate the display currency:
```ts
      .setFooter({ text: `Values in ${targetCurrency} · ahousedividedgame.com` });
```

**1i.** Update the corporation details section similarly — convert `liquidCapital` and `sharePrice`:
```ts
             `📍 ${c.headquartersStateName} | 💰 ${formatCurrency(convert(c.liquidCapital ?? 0, c.countryId), targetCurrency)}\n` +
             `📈 ${formatSharePrice(convert(c.sharePrice ?? 0, c.countryId), targetCurrency)} | 🏭 ${c.typeLabel || c.type}`;
```

- [ ] **Step 2: Update `/stockpick`**

In `src/commands/stockpick.ts`:

**2a.** Add imports:
```ts
import {
  currencyFor,
  formatCurrency,
  formatSharePrice,
  fetchForexRates,
  convertCurrency,
  CURRENCY_CHOICES,
} from "../utils/currency.js";
```

**2b.** Delete local `currency()` function (line 100-102).

**2c.** Add `countryId` to `ScoredPick` interface:
```ts
interface ScoredPick {
  name: string;
  corpUrl: string | null;
  countryId: string | undefined;
  sharePrice: number;
```

**2d.** In `scorePick`, pass through countryId:
```ts
    countryId: corp.corporation?.countryId,
```

**2e.** Add currency option to command definition:
```ts
  .addStringOption((o) =>
    o
      .setName("currency")
      .setDescription("Display currency (default: USD)")
      .setRequired(false)
      .addChoices(...CURRENCY_CHOICES),
  );
```

(Add this after the existing `limit` option.)

**2f.** In `execute()`, get selected currency and fetch rates:
```ts
    const targetCurrency = interaction.options.getString("currency") || "USD";
    // ...after getting picks...
    const rates = await fetchForexRates();
```

**2g.** Update `buildPicksEmbed` to accept `targetCurrency` and `rates`:
```ts
function buildPicksEmbed(picks: ScoredPick[], total: number, targetCurrency: string, rates: Record<string, number>): EmbedBuilder {
```

In the embed loop, convert values:
```ts
    const fromCc = currencyFor(p.countryId);
    const spConverted = convertCurrency(p.sharePrice, fromCc, targetCurrency, rates);
    const incConverted = convertCurrency(p.income, fromCc, targetCurrency, rates);
    const mcConverted = convertCurrency(p.marketCap, fromCc, targetCurrency, rates);

    const value = [
      `Price: **${formatSharePrice(spConverted, targetCurrency)}** (${changeSign}${p.priceChange24h.toFixed(1)}%)`,
      `Income: ${formatCurrency(incConverted, targetCurrency)} \u00b7 Mkt Cap: ${formatCurrency(mcConverted, targetCurrency)}`,
      `Float: ${p.publicFloat.toLocaleString("en-US")} (${p.publicFloatPct.toFixed(1)}%) \u00b7 D/E: ${deStr}`,
      `Score: ${p.score}/100`,
    ].join("\n");
```

Add footer:
```ts
    .setFooter({ text: `Values in ${targetCurrency} · ahousedividedgame.com` })
```

- [ ] **Step 3: Update `/sectors`**

In `src/commands/sectors.ts`:

**3a.** Add imports:
```ts
import {
  currencyFor,
  formatCurrency,
  fetchForexRates,
  convertCurrency,
  CURRENCY_CHOICES,
} from "../utils/currency.js";
```

**3b.** Add currency option to command definition. After the `page` option:
```ts
  .addStringOption((option) =>
    option
      .setName("currency")
      .setDescription("Display currency (default: USD)")
      .setRequired(false)
      .addChoices(...CURRENCY_CHOICES)
  );
```

**3c.** In `execute()`, get currency and fetch rates:
```ts
  const targetCurrency = interaction.options.getString("currency") || "USD";
```
After fetching initial result:
```ts
  const rates = await fetchForexRates();
```

**3d.** Update `buildOwnedEmbed` to accept `targetCurrency` and `rates`:
```ts
function buildOwnedEmbed(result: OwnedSectorsResponse, targetCurrency: string, rates: Record<string, number>): EmbedBuilder {
```

Replace the revenue display:
```ts
    const fromCc = currencyFor(sector.countryId);
    const rev = convertCurrency(sector.revenue, fromCc, targetCurrency, rates);
    return `${rank}. [**${sector.corporationName}** — ${sector.stateName}](${sectorHref}) · ${formatCurrency(rev, targetCurrency)} rev · ${sector.growthRate.toFixed(1)}% growth · ${sector.workers.toLocaleString()} workers`;
```

Add footer note for currency:
```ts
      text: `Page ${result.page}/${result.totalPages} · ${result.totalItems} total sectors · Values in ${targetCurrency} · ahousedividedgame.com`,
```

**3e.** Update `buildUnownedEmbed` similarly with `targetCurrency` and `rates` params:
```ts
function buildUnownedEmbed(result: UnownedSectorsResponse, targetCurrency: string, rates: Record<string, number>): EmbedBuilder {
```

Convert each line's values:
```ts
    const fromCc = currencyFor(sector.countryId);
    const unowned = convertCurrency(sector.unownedRevenue, fromCc, targetCurrency, rates);
    const total = convertCurrency(sector.totalMarket, fromCc, targetCurrency, rates);
    return `${rank}. [**${sector.stateName}**](${stateHref}) — ${formatCurrency(unowned, targetCurrency)} unowned (of ${formatCurrency(total, targetCurrency)} total)`;
```

**3f.** Update all call sites of `buildOwnedEmbed`/`buildUnownedEmbed` to pass `targetCurrency` and `rates`.

- [ ] **Step 4: Update `/marketshare`**

In `src/commands/marketshare.ts`:

**4a.** Add imports:
```ts
import {
  currencyFor,
  formatCurrency,
  fetchForexRates,
  convertCurrency,
  CURRENCY_CHOICES,
} from "../utils/currency.js";
```

**4b.** Add currency option to command definition. After the `page` option:
```ts
  .addStringOption((option) =>
    option
      .setName("currency")
      .setDescription("Display currency (default: auto by country)")
      .setRequired(false)
      .addChoices(...CURRENCY_CHOICES)
  );
```

**4c.** In `execute()`, get currency with country-aware default:
```ts
  const explicitCurrency = interaction.options.getString("currency");
  const targetCurrency = explicitCurrency || (country ? currencyFor(country) : "USD");
```
After fetching result:
```ts
  const rates = await fetchForexRates();
```

**4d.** Update `buildEmbed` to accept `targetCurrency` and `rates`:
```ts
function buildEmbed(result: MarketShareResponse, showUnowned: boolean, targetCurrency: string, rates: Record<string, number>): EmbedBuilder {
```

Replace revenue display in the company lines:
```ts
      const fromCc = currencyFor(c.countryId);
      const rev = convertCurrency(c.revenue, fromCc, targetCurrency, rates);
      return `${rank}. **${nameStr}** — ${c.marketSharePercent.toFixed(2)}% · ${formatCurrency(rev, targetCurrency)}${tag}`;
```

Replace the footer monetary values:
```ts
  if (unownedDollar != null && unownedDollar > 0) {
    const fromCc = currencyFor(result.scope.country);
    const converted = convertCurrency(unownedDollar, fromCc, targetCurrency, rates);
    footerParts.push(`Unowned: ${formatCurrency(converted, targetCurrency)} (${result.unownedPercent.toFixed(2)}%)`);
  }
```

```ts
  if (result.totalMarket > 0) {
    const fromCc = currencyFor(result.scope.country);
    const converted = convertCurrency(result.totalMarket, fromCc, targetCurrency, rates);
    footerParts.push(`TAM: ${formatCurrency(converted, targetCurrency)}`);
  }
```

Add currency label to footer:
```ts
  footerParts.push(`Values in ${targetCurrency}`);
```

**4e.** Update all call sites of `buildEmbed` to pass `targetCurrency` and `rates`.

- [ ] **Step 5: Update `/bonds`**

In `src/commands/bonds.ts`:

**5a.** Add imports:
```ts
import { currencyFor, formatCurrency, formatSharePrice } from "../utils/currency.js";
```

**5b.** In the bond display loop within `execute()`, use each bond's `countryId`:
```ts
        const cc = currencyFor(b.countryId);
        const price = formatSharePrice(b.marketPrice, cc);
        const ytm = `${(b.yieldToMaturity ?? 0).toFixed(1)}%`;
        const issued = formatCurrency(b.totalIssued, cc);
```

Replace the Total Outstanding field:
```ts
      .addFields({
        name: "Total Outstanding",
        value: `$${(totalOutstandingDebt ?? 0).toLocaleString("en-US")}`,
```
With (use the first bond's currency as representative):
```ts
      const totalCc = bonds.length > 0 ? currencyFor(bonds[0].countryId) : "USD";
```
```ts
      .addFields({
        name: "Total Outstanding",
        value: formatCurrency(totalOutstandingDebt, totalCc),
```

- [ ] **Step 6: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/commands/corpcompare.ts src/commands/stockpick.ts src/commands/sectors.ts src/commands/marketshare.ts src/commands/bonds.ts
git commit -m "feat: add currency selector to cross-country commands with forex conversion"
```

---

## Task 6: Bot — New `/forex` command

**Repo:** ADHD Bot

**Files:**
- Create: `src/commands/forex.ts`
- Modify: `src/utils/chartGenerator.ts`

- [ ] **Step 1: Add `generateForexChart()` to chartGenerator.ts**

In `src/utils/chartGenerator.ts`, add the following function at the bottom of the file:

```ts
// ---------------------------------------------------------------------------
// Forex rate chart — 48h performance, multi-line, colorblind-safe
// ---------------------------------------------------------------------------

export interface ForexRateData {
  currencyCode: string;
  rateHistory: Array<{ turn: number; rate: number }>;
}

const FOREX_COLORS: Record<string, string> = {
  USD: "#4477AA",
  GBP: "#EE6677",
  JPY: "#228833",
  CAD: "#CCBB44",
  EUR: "#AA3377",
};

const FOREX_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "\u00a3",
  JPY: "\u00a5",
  CAD: "C$",
  EUR: "\u20ac",
};

function normalizeToPercent(values: number[]): number[] {
  const base = values[0];
  if (!base) return values.map(() => 0);
  return values.map((v) => ((v - base) / base) * 100);
}

export async function generateForexChart(rates: ForexRateData[]): Promise<Buffer> {
  // Find common turn range
  const allTurns = new Set<number>();
  for (const r of rates) {
    for (const h of r.rateHistory) allTurns.add(h.turn);
  }
  const turns = [...allTurns].sort((a, b) => a - b);

  const datasets = rates
    .filter((r) => r.rateHistory.length > 1)
    .map((r) => {
      const rateMap = new Map(r.rateHistory.map((h) => [h.turn, h.rate]));
      const rawValues = turns.map((t) => rateMap.get(t) ?? NaN);

      // Fill NaN gaps with last known value
      let last = rawValues.find((v) => !isNaN(v)) ?? 0;
      const filled = rawValues.map((v) => {
        if (!isNaN(v)) { last = v; return v; }
        return last;
      });

      const pctValues = normalizeToPercent(filled);

      const sym = FOREX_SYMBOLS[r.currencyCode] ?? r.currencyCode;
      return {
        label: `${r.currencyCode} (${sym})`,
        data: pctValues,
        borderColor: FOREX_COLORS[r.currencyCode] ?? "#999999",
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.2,
        fill: false,
      };
    });

  const configuration = {
    type: "line" as const,
    data: {
      labels: turns.map((t) => `T${t}`),
      datasets,
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: "Currency Performance — Last 48 Turns",
          color: "#ffffff",
          font: { size: 16, weight: "bold" as const },
        },
        legend: {
          labels: { color: "#ffffff", usePointStyle: true },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.1)" },
          ticks: { color: "#ffffff", maxTicksLimit: 12 },
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.1)" },
          ticks: {
            color: "#ffffff",
            callback: (v: number | string) => {
              const n = Number(v);
              return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
            },
          },
          title: { display: true, text: "Change %", color: "#ffffff" },
        },
      },
    },
  };

  return canvasRenderService.renderToBuffer(configuration as ChartConfiguration);
}
```

- [ ] **Step 2: Create `src/commands/forex.ts`**

```ts
import {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { apiFetchPublic } from "../utils/api-base.js";
import { symbolFor } from "../utils/currency.js";
import { generateForexChart, type ForexRateData } from "../utils/chartGenerator.js";
import { replyWithError, standardFooter } from "../utils/helpers.js";

export const cooldown = 10;

interface ForexExchangeRate {
  countryId: string;
  currencyCode: string;
  rate: number;
  baseRate: number;
  macroTarget: number;
  buyVolume24: number;
  sellVolume24: number;
  rateHistory: Array<{ turn: number; rate: number }>;
}

interface ForexExchangeResponse {
  rates: ForexExchangeRate[];
  orderBook: unknown[];
}

export const data = new SlashCommandBuilder()
  .setName("forex")
  .setDescription("View currency exchange rates and 48-hour performance");

function formatRate(rate: number): string {
  if (rate >= 10) return rate.toFixed(2);
  return rate.toFixed(4);
}

function pctChange(history: Array<{ rate: number }>): string {
  if (history.length < 2) return "N/A";
  const first = history[0].rate;
  const last = history[history.length - 1].rate;
  if (!first) return "N/A";
  const pct = ((last - first) / first) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const res = await apiFetchPublic<ForexExchangeResponse>("/api/forex/exchange");

    if (!res.rates || res.rates.length === 0) {
      await interaction.editReply({ content: "Currency exchange data is not available yet." });
      return;
    }

    // Build rate table
    const header = "Currency  │  Rate/INT  │  48h Δ";
    const separator = "──────────┼────────────┼──────────";
    const rows = res.rates.map((r) => {
      const sym = symbolFor(r.currencyCode);
      const label = `${r.currencyCode} (${sym})`.padEnd(9);
      const rate = formatRate(r.rate).padStart(10);
      const change = pctChange(r.rateHistory).padStart(8);
      return `${label} │ ${rate} │ ${change}`;
    });

    const table = `\`\`\`\n${header}\n${separator}\n${rows.join("\n")}\n\`\`\``;

    const embed = new EmbedBuilder()
      .setTitle("Currency Exchange Rates")
      .setColor(0x5865f2)
      .setDescription(table);

    // Volume fields
    for (const r of res.rates) {
      const sym = symbolFor(r.currencyCode);
      embed.addFields({
        name: `${r.currencyCode} (${sym}) Volume`,
        value: `Buy: ${Math.round(r.buyVolume24).toLocaleString()} · Sell: ${Math.round(r.sellVolume24).toLocaleString()}`,
        inline: true,
      });
    }

    embed.setFooter(standardFooter("1 INT = listed rate in local currency · Updated every turn"));

    // Generate chart
    const chartData: ForexRateData[] = res.rates
      .filter((r) => r.rateHistory.length > 1)
      .map((r) => ({
        currencyCode: r.currencyCode,
        rateHistory: r.rateHistory,
      }));

    if (chartData.length > 0) {
      const chartBuffer = await generateForexChart(chartData);
      const attachment = new AttachmentBuilder(chartBuffer, {
        name: `forex-${Date.now()}.png`,
        description: "Currency performance chart",
      });

      embed.setImage(`attachment://${attachment.name}`);
      await interaction.editReply({ embeds: [embed], files: [attachment] });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    await replyWithError(interaction, "forex", error);
  }
}
```

- [ ] **Step 3: Register the command**

Check how commands are registered in the bot. Find the command loader (likely `src/index.ts` or a command handler file) and ensure `forex.ts` is picked up. If commands are auto-discovered from the `src/commands/` directory, no change is needed. If they're manually registered, add the import.

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/commands/forex.ts src/utils/chartGenerator.ts
git commit -m "feat: add /forex command with rate table and 48h performance chart"
```

---

## Task 7: Verification

- [ ] **Step 1: Run full typecheck on bot**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 2: Run full typecheck on game API**

In the A House Divided repo:
Run: `npm run typecheck`
Expected: Zero errors.

- [ ] **Step 3: Run bot tests if any**

Run: `npm test` (if test suite exists)
Expected: All pass.

- [ ] **Step 4: Run game API verify**

In the A House Divided repo:
Run: `npm run verify`
Expected: lint + format + typecheck + tests all pass.

- [ ] **Step 5: Manual smoke test checklist**

Test each command with a known non-US corporation (e.g., a UK or JP corp) and verify:
- [ ] `/corporation [UK corp]` — shows £ symbol
- [ ] `/corporation [JP corp]` — shows ¥ symbol
- [ ] `/profile` — shows correct currency for character's country
- [ ] `/investor` — portfolio in correct currency
- [ ] `/bonds` — bond prices in issuer's currency
- [ ] `/corpcompare [US corp] [JP corp] currency:GBP` — all values in £ with conversion
- [ ] `/stockpick currency:JPY` — all values in ¥
- [ ] `/sectors type:financial currency:GBP` — revenue in £
- [ ] `/marketshare sector:financial country:JP` — defaults to ¥
- [ ] `/stock-chart corp:[UK corp]` — share price in £
- [ ] `/market country:uk` — footer shows GBP
- [ ] `/blackjack play wager:100` — correct currency for character
- [ ] `/forex` — rate table + chart renders with all currencies
