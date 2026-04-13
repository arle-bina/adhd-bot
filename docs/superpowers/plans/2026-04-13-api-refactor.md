# API Layer Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global rate limiting to API calls, centralize duplicated formatting constants, and split the 1,293-line api.ts into domain files.

**Architecture:** A shared `apiFetch` wrapper in `api-base.ts` adds concurrency limiting (max 5 concurrent requests) with a simple promise-based semaphore — no new dependencies. Formatting constants and functions move to `formatting.ts`. The monolithic `api.ts` splits into `api-politics.ts`, `api-economy.ts`, and `api-game.ts`, each importing `apiFetch` from the base. A barrel `api.ts` re-exports everything for backward compatibility during migration, then gets deleted once all imports point to the new files.

**Tech Stack:** TypeScript, Node.js native fetch, Vitest

---

### Task 1: Create `src/utils/formatting.ts`

**Files:**
- Create: `src/utils/formatting.ts`
- Create: `tests/utils/formatting.test.ts`

- [ ] **Step 1: Create `src/utils/formatting.ts`**

```typescript
// Centralized formatting functions and constants for game concepts.

export function formatElectionType(type: string): string {
  const map: Record<string, string> = {
    senate: "Senate",
    house: "House",
    stateSenate: "State Senate",
    governor: "Governor",
    president: "Presidential",
    commons: "Commons",
    primeMinister: "Prime Minister",
    shugiin: "Shūgiin",
    sangiin: "Sangiin",
    bundestag: "Bundestag",
  };
  return map[type] ?? type;
}

export function formatOfficeType(type: string): string {
  const map: Record<string, string> = {
    governor: "Governor",
    senate: "Senator",
    house: "Representative",
    stateSenate: "State Senator",
    commons: "MP",
    primeMinister: "Prime Minister",
    shugiin: "Representative",
    sangiin: "Councillor",
    bundestag: "MdB",
  };
  return map[type] ?? type;
}

export const RACE_EMOJI: Record<string, string> = {
  senate: "🏛️",
  house: "🏠",
  stateSenate: "🏢",
  governor: "👔",
  president: "🇺🇸",
  commons: "🇬🇧",
  primeMinister: "🇬🇧",
  shugiin: "🇯🇵",
  sangiin: "🇯🇵",
  bundestag: "🇩🇪",
};

export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  UK: "United Kingdom",
  JP: "Japan",
  CA: "Canada",
  DE: "Germany",
};

export const COUNTRY_FLAG: Record<string, string> = {
  US: "🇺🇸",
  UK: "🇬🇧",
  JP: "🇯🇵",
  CA: "🇨🇦",
  DE: "🇩🇪",
};

export const COUNTRY_COLORS: Record<string, number> = {
  US: 0x3c5a9a,
  UK: 0x9a3c3c,
  CA: 0xd52b1e,
  DE: 0xffcc00,
  JP: 0xbc002d,
};

export const EXCHANGE_LABELS: Record<string, string> = {
  global: "Global Stock Market",
  nyse: "NYSE",
  ftse: "FTSE",
  nikkei: "Nikkei",
  tsx: "TSX",
  dax: "DAX",
};
```

- [ ] **Step 2: Create `tests/utils/formatting.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import {
  formatElectionType,
  formatOfficeType,
  RACE_EMOJI,
  COUNTRY_NAMES,
  COUNTRY_FLAG,
  COUNTRY_COLORS,
  EXCHANGE_LABELS,
} from "../../src/utils/formatting.js";

describe("formatElectionType", () => {
  it.each([
    ["senate", "Senate"],
    ["house", "House"],
    ["governor", "Governor"],
    ["president", "Presidential"],
    ["commons", "Commons"],
    ["primeMinister", "Prime Minister"],
    ["shugiin", "Shūgiin"],
    ["sangiin", "Sangiin"],
    ["bundestag", "Bundestag"],
  ])("maps '%s' to '%s'", (input, expected) => {
    expect(formatElectionType(input)).toBe(expected);
  });

  it("passes through unknown types unchanged", () => {
    expect(formatElectionType("unknown_type")).toBe("unknown_type");
  });
});

describe("formatOfficeType", () => {
  it.each([
    ["governor", "Governor"],
    ["senate", "Senator"],
    ["house", "Representative"],
    ["stateSenate", "State Senator"],
    ["commons", "MP"],
    ["primeMinister", "Prime Minister"],
    ["shugiin", "Representative"],
    ["sangiin", "Councillor"],
    ["bundestag", "MdB"],
  ])("maps '%s' to '%s'", (input, expected) => {
    expect(formatOfficeType(input)).toBe(expected);
  });

  it("passes through unknown types unchanged", () => {
    expect(formatOfficeType("unknown_type")).toBe("unknown_type");
  });
});

describe("constant maps", () => {
  it("RACE_EMOJI has entries for all election types", () => {
    expect(Object.keys(RACE_EMOJI)).toEqual(
      expect.arrayContaining(["senate", "house", "shugiin", "sangiin", "bundestag"])
    );
  });

  it("COUNTRY_NAMES covers all 5 countries", () => {
    expect(Object.keys(COUNTRY_NAMES).sort()).toEqual(["CA", "DE", "JP", "UK", "US"]);
  });

  it("COUNTRY_FLAG covers all 5 countries", () => {
    expect(Object.keys(COUNTRY_FLAG).sort()).toEqual(["CA", "DE", "JP", "UK", "US"]);
  });

  it("COUNTRY_COLORS covers all 5 countries", () => {
    expect(Object.keys(COUNTRY_COLORS).sort()).toEqual(["CA", "DE", "JP", "UK", "US"]);
  });

  it("EXCHANGE_LABELS covers all exchanges", () => {
    expect(Object.keys(EXCHANGE_LABELS).sort()).toEqual(["dax", "ftse", "global", "nikkei", "nyse", "tsx"]);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests pass including the new formatting tests.

- [ ] **Step 4: Commit**

```bash
git add src/utils/formatting.ts tests/utils/formatting.test.ts
git commit -m "feat: create centralized formatting.ts with shared constants and functions"
```

---

### Task 2: Migrate consumers to use `formatting.ts`

**Files:**
- Modify: `src/commands/elections.ts` — remove `formatElectionType`, import from formatting
- Modify: `src/commands/election.ts` — remove `RACE_EMOJI`, import from formatting
- Modify: `src/commands/calendar.ts` — remove `RACE_EMOJI`, import from formatting
- Modify: `src/commands/state.ts` — remove `formatOfficeType`, import from formatting
- Modify: `src/commands/government.ts` — remove `COUNTRY_FLAG`, import from formatting
- Modify: `src/commands/marketshare.ts` — remove `COUNTRY_NAMES`, import from formatting
- Modify: `src/commands/stock-chart.ts` — remove `exchangeLabels`, import `EXCHANGE_LABELS` from formatting
- Modify: `src/utils/roles.ts` — remove `COUNTRY_NAMES` and `COUNTRY_COLORS`, import from formatting
- Modify: `tests/commands/elections.test.ts` — update import path
- Modify: `tests/commands/state.test.ts` — update import path

- [ ] **Step 1: Update `src/commands/elections.ts`**

Remove the `formatElectionType` function definition (lines 14-25). Add import:

```typescript
import { formatElectionType } from "../utils/formatting.js";
```

Keep `export { formatElectionType }` as a re-export so calendar.ts and election.ts can be migrated independently. Actually — calendar.ts and election.ts currently import from `./elections.js`, so update them too in this step.

- [ ] **Step 2: Update `src/commands/election.ts`**

Remove the local `RACE_EMOJI` definition (lines 22-33). Change import:

```typescript
import { formatElectionType, RACE_EMOJI } from "../utils/formatting.js";
```

Remove the old import: `import { formatElectionType } from "./elections.js";`

- [ ] **Step 3: Update `src/commands/calendar.ts`**

Remove the local `RACE_EMOJI` definition (lines 14-25). Change imports:

```typescript
import { formatElectionType, RACE_EMOJI } from "../utils/formatting.js";
```

Remove the old import: `import { formatElectionType } from "./elections.js";`

- [ ] **Step 4: Update `src/commands/state.ts`**

Remove the `formatOfficeType` function definition (lines 10-23). Add import:

```typescript
import { formatOfficeType } from "../utils/formatting.js";
```

- [ ] **Step 5: Update `src/commands/government.ts`**

Remove the local `COUNTRY_FLAG` definition (lines 17-23). Add import:

```typescript
import { COUNTRY_FLAG } from "../utils/formatting.js";
```

- [ ] **Step 6: Update `src/commands/marketshare.ts`**

Remove the local `COUNTRY_NAMES` definition (lines 15-21). Add import:

```typescript
import { COUNTRY_NAMES } from "../utils/formatting.js";
```

- [ ] **Step 7: Update `src/commands/stock-chart.ts`**

Remove the local `exchangeLabels` definition (lines 100-107). Add import:

```typescript
import { EXCHANGE_LABELS } from "../utils/formatting.js";
```

Update the usage on the `buildTitle` function: `exchangeLabels[exchange]` → `EXCHANGE_LABELS[exchange]`.

- [ ] **Step 8: Update `src/utils/roles.ts`**

Remove the local `COUNTRY_NAMES` (lines 4-10) and `COUNTRY_COLORS` (lines 9-14) definitions. Add import:

```typescript
import { COUNTRY_NAMES, COUNTRY_COLORS } from "./formatting.js";
```

- [ ] **Step 9: Update test imports**

`tests/commands/elections.test.ts`:
```typescript
import { formatElectionType } from "../../src/utils/formatting.js";
```

`tests/commands/state.test.ts`:
```typescript
import { formatOfficeType } from "../../src/utils/formatting.js";
```

- [ ] **Step 10: Run tests and typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: Zero type errors, all 43+ tests pass.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: migrate all consumers to centralized formatting.ts"
```

---

### Task 3: Create `src/utils/api-base.ts` with rate-limited fetch

**Files:**
- Create: `src/utils/api-base.ts`
- Create: `tests/utils/api-base.test.ts`

- [ ] **Step 1: Create `src/utils/api-base.ts`**

```typescript
// Shared API infrastructure: error class, rate-limited fetch wrapper.

export class ApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly responseBody: string;

  constructor(status: number, endpoint: string, responseBody: string) {
    const summary = responseBody.slice(0, 200) || "(empty response)";
    super(`API ${status} from ${endpoint}: ${summary}`);
    this.name = "ApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.responseBody = responseBody;
  }
}

async function throwApiError(response: Response, endpoint: string): Promise<never> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    body = "(could not read response body)";
  }
  throw new ApiError(response.status, endpoint, body);
}

// ---------------------------------------------------------------------------
// Concurrency-limited fetch — prevents flooding the game API
// ---------------------------------------------------------------------------

const MAX_CONCURRENT = 5;
const FETCH_TIMEOUT_MS = 10_000;

let active = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  if (waiting.length > 0) {
    const next = waiting.shift()!;
    next();
  } else {
    active--;
  }
}

/** Build the standard auth headers for bot API calls. */
function authHeaders(): Record<string, string> {
  return { "X-Bot-Token": process.env.GAME_API_KEY! };
}

/** Rate-limited GET request to the game API. */
export async function apiFetch<T>(pathname: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(pathname, process.env.GAME_API_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  await acquire();
  try {
    const response = await fetch(url.toString(), {
      headers: authHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) await throwApiError(response, pathname);
    return response.json() as Promise<T>;
  } finally {
    release();
  }
}

/** Rate-limited GET request without auth (public endpoints). */
export async function apiFetchPublic<T>(pathname: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(pathname, process.env.GAME_API_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  await acquire();
  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) await throwApiError(response, pathname);
    return response.json() as Promise<T>;
  } finally {
    release();
  }
}

/** Rate-limited POST request to the game API. */
export async function apiPost<T>(pathname: string, body: unknown): Promise<T> {
  const url = new URL(pathname, process.env.GAME_API_URL);

  await acquire();
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) await throwApiError(response, pathname);
    return response.json() as Promise<T>;
  } finally {
    release();
  }
}

// Expose for testing only
export const _testing = { acquire, release, getActive: () => active, getWaitingCount: () => waiting.length };
```

- [ ] **Step 2: Create `tests/utils/api-base.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { _testing, ApiError } from "../../src/utils/api-base.js";

const { acquire, release, getActive, getWaitingCount } = _testing;

describe("ApiError", () => {
  it("captures status, endpoint, and response body", () => {
    const err = new ApiError(404, "/api/test", '{"error":"not found"}');
    expect(err.status).toBe(404);
    expect(err.endpoint).toBe("/api/test");
    expect(err.responseBody).toBe('{"error":"not found"}');
    expect(err.message).toContain("404");
    expect(err.message).toContain("/api/test");
  });

  it("truncates long response bodies in the message", () => {
    const longBody = "x".repeat(300);
    const err = new ApiError(500, "/api/test", longBody);
    expect(err.message.length).toBeLessThan(longBody.length + 50);
    expect(err.responseBody).toBe(longBody);
  });
});

describe("semaphore", () => {
  it("allows up to 5 concurrent acquisitions", async () => {
    // Drain any leftover state
    while (getActive() > 0) release();

    const handles: Array<Promise<void>> = [];
    for (let i = 0; i < 5; i++) {
      handles.push(acquire());
    }
    await Promise.all(handles);
    expect(getActive()).toBe(5);

    // 6th should queue
    let sixthResolved = false;
    const sixth = acquire().then(() => { sixthResolved = true; });
    // Give microtasks a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(sixthResolved).toBe(false);
    expect(getWaitingCount()).toBe(1);

    // Release one — sixth should proceed
    release();
    await sixth;
    expect(sixthResolved).toBe(true);
    expect(getActive()).toBe(5);

    // Clean up
    for (let i = 0; i < 5; i++) release();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx tsc --noEmit && npm test`
Expected: All tests pass including api-base tests.

- [ ] **Step 4: Commit**

```bash
git add src/utils/api-base.ts tests/utils/api-base.test.ts
git commit -m "feat: add api-base.ts with concurrency-limited fetch (max 5)"
```

---

### Task 4: Create `src/utils/api-politics.ts`

**Files:**
- Create: `src/utils/api-politics.ts`

This file contains: character lookup, leaderboard, party, elections, state, news, career, achievements, race detail, predict, government, sync-roles.

- [ ] **Step 1: Create `src/utils/api-politics.ts`**

Move all politics-domain types and functions from `api.ts`, replacing raw `fetch` calls with `apiFetch` from `api-base.ts`. The `normalizeLookupResponse` helper stays here (only used by lookup functions).

The file should contain these exports (types + functions):
- `CharacterResult`, `LookupResponse`, `lookupByName`, `lookupByDiscordId`
- `LeaderboardCharacter`, `LeaderboardMetric`, `getLeaderboard`
- `getParty` (private interfaces `PartyTopMember`, `PartyData`, `PartyResponse`)
- `ElectionCandidate`, `Election`, `getElections`
- `getState` (private interfaces `StateOfficial`, `StateData`, `StateResponse`)
- `getNews` (private interfaces `NewsPost`, `NewsResponse`)
- `CareerEvent`, `getCareer`
- `Achievement`, `getAchievements`
- `RaceEndorsement`, `RaceCandidate`, `RaceVoteSnapshot`, `RaceVotes`, `RaceElection`, `RacePhase`, `RaceIncumbent`, `RaceDetailResponse`, `RaceResponse`, `getRace`
- `PredictionPartyEntry`, `PredictionResponse`, `getPrediction`
- `GovernmentOfficial`, `GovernmentResponse`, `getGovernment`
- `SyncRolesDetails`, `SyncRolesResponse`, `getSyncRoles`

Each function replaces the manual fetch pattern:
```typescript
// Before (in api.ts)
const url = new URL("/api/discord-bot/leaderboard", process.env.GAME_API_URL);
if (params.metric) url.searchParams.set("metric", params.metric);
const response = await fetch(url.toString(), {
  headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
  signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
});
if (!response.ok) await throwApiError(response, url.pathname);
return response.json();

// After (in api-politics.ts)
import { apiFetch } from "./api-base.js";
const params: Record<string, string> = {};
if (p.metric) params.metric = p.metric;
return apiFetch<LeaderboardResponse>("/api/discord-bot/leaderboard", params);
```

Special cases:
- `lookupByName` / `lookupByDiscordId`: keep `normalizeLookupResponse` as a private helper. Use `apiFetch` but call `normalizeLookupResponse` on the raw result. Since `apiFetch` returns parsed JSON, these two functions need to use it and then normalize:
```typescript
export async function lookupByName(name: string): Promise<LookupResponse> {
  const raw = await apiFetch<Record<string, unknown>>("/api/discord-bot/lookup", { name });
  return normalizeLookupResponse(raw);
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Zero errors (the file compiles but nothing imports it yet).

- [ ] **Step 3: Commit**

```bash
git add src/utils/api-politics.ts
git commit -m "feat: create api-politics.ts with rate-limited politics endpoints"
```

---

### Task 5: Create `src/utils/api-economy.ts`

**Files:**
- Create: `src/utils/api-economy.ts`

This file contains: corporation, bonds, financials, sectors, market share, stock exchange, stock chart, market data.

- [ ] **Step 1: Create `src/utils/api-economy.ts`**

Move all economy-domain types and functions from `api.ts`, replacing raw `fetch` with `apiFetch`/`apiFetchPublic`.

Exports:
- `CorporationListItem`, `CorporationSector`, `CorporationFinancials`, `CorporationCeo`, `CorporationData`, `CorporationResponse`, `getCorporationList`, `getCorporation`
- `BondEntry`, `BondsResponse`, `getBonds`
- `FinancialsResponse`, `getFinancials`
- `SectorType`, `OwnedSector`, `UnownedSector`, `OwnedSectorsResponse`, `UnownedSectorsResponse`, `SectorsResponse`, `getSectors`
- `StockListing`, `MarketHistoryPoint`, `MarketDataResponse`, `getMarketData`
- `MarketShareCompany`, `MarketShareResponse`, `getMarketShare`
- `StockChartMarketPoint`, `StockChartCorpPoint`, `StockChartMarketResponse`, `StockChartCorpResponse`, `StockChartNotFoundResponse`, `StockChartResponse`, `getStockChart`, `getStockChartCorpList`
- `getStockExchange` — uses `apiFetchPublic` (no auth header)

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/api-economy.ts
git commit -m "feat: create api-economy.ts with rate-limited economy endpoints"
```

---

### Task 6: Create `src/utils/api-game.ts`

**Files:**
- Create: `src/utils/api-game.ts`

This file contains: turn status, autocomplete, blackjack.

- [ ] **Step 1: Create `src/utils/api-game.ts`**

Exports:
- `TurnStatus`, `getTurnStatus` — uses `apiFetchPublic` (no auth)
- `AutocompleteResult`, `getAutocomplete`
- `BlackjackFundResponse`, `getBlackjackFund`
- `BlackjackBalanceResponse`, `getBlackjackBalance`
- `BlackjackPlaceWagerRequest`, `BlackjackPlaceWagerResponse`, `postBlackjackPlaceWager` — uses `apiPost`
- `BlackjackResolveRequest`, `BlackjackResolveResponse`, `postBlackjackResolve` — uses `apiPost`

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/api-game.ts
git commit -m "feat: create api-game.ts with rate-limited game/blackjack endpoints"
```

---

### Task 7: Replace `api.ts` with barrel re-exports

**Files:**
- Modify: `src/utils/api.ts` — replace entire contents with re-exports

- [ ] **Step 1: Replace `src/utils/api.ts` with barrel file**

Replace the entire 1,293-line file with:

```typescript
// Barrel re-export — all API functions and types are now split by domain.
// This file exists so existing imports continue to work unchanged.
// Once all imports point to the domain files, delete this barrel.

export { ApiError } from "./api-base.js";
export type { ApiError as ApiErrorType } from "./api-base.js";

export {
  lookupByName,
  lookupByDiscordId,
  getLeaderboard,
  getParty,
  getElections,
  getState,
  getNews,
  getCareer,
  getAchievements,
  getRace,
  getPrediction,
  getGovernment,
  getSyncRoles,
} from "./api-politics.js";

export type {
  CharacterResult,
  LookupResponse,
  LeaderboardCharacter,
  LeaderboardMetric,
  ElectionCandidate,
  Election,
  CareerEvent,
  Achievement,
  RaceEndorsement,
  RaceCandidate,
  RaceVoteSnapshot,
  RaceVotes,
  RaceElection,
  RacePhase,
  RaceIncumbent,
  RaceDetailResponse,
  RaceResponse,
  PredictionPartyEntry,
  PredictionResponse,
  GovernmentOfficial,
  GovernmentResponse,
  SyncRolesDetails,
  SyncRolesResponse,
} from "./api-politics.js";

export {
  getCorporationList,
  getCorporation,
  getBonds,
  getFinancials,
  getSectors,
  getMarketData,
  getMarketShare,
  getStockChart,
  getStockChartCorpList,
  getStockExchange,
} from "./api-economy.js";

export type {
  CorporationListItem,
  CorporationSector,
  CorporationFinancials,
  CorporationCeo,
  CorporationData,
  CorporationResponse,
  BondEntry,
  BondsResponse,
  FinancialsResponse,
  SectorType,
  OwnedSector,
  UnownedSector,
  OwnedSectorsResponse,
  UnownedSectorsResponse,
  SectorsResponse,
  StockListing,
  MarketHistoryPoint,
  MarketDataResponse,
  MarketShareCompany,
  MarketShareResponse,
  StockChartMarketPoint,
  StockChartCorpPoint,
  StockChartMarketResponse,
  StockChartCorpResponse,
  StockChartNotFoundResponse,
  StockChartResponse,
} from "./api-economy.js";

export {
  getTurnStatus,
  getAutocomplete,
  getBlackjackFund,
  getBlackjackBalance,
  postBlackjackPlaceWager,
  postBlackjackResolve,
} from "./api-game.js";

export type {
  TurnStatus,
  AutocompleteResult,
  BlackjackFundResponse,
  BlackjackBalanceResponse,
  BlackjackPlaceWagerRequest,
  BlackjackPlaceWagerResponse,
  BlackjackResolveRequest,
  BlackjackResolveResponse,
} from "./api-game.js";
```

- [ ] **Step 2: Run typecheck and tests**

Run: `npx tsc --noEmit && npm test`
Expected: Zero type errors, all tests pass. Every existing import from `../utils/api.js` resolves through the barrel.

- [ ] **Step 3: Commit**

```bash
git add src/utils/api.ts
git commit -m "refactor: replace api.ts with barrel re-exports from domain files"
```

---

### Task 8: Update command imports to use domain files directly

**Files:**
- Modify: All 22 command/util files that import from `api.ts`

This task updates each file's import to point directly to the domain file instead of the barrel. Grouped by domain:

- [ ] **Step 1: Politics commands — update imports**

These files change `"../utils/api.js"` → `"../utils/api-politics.js"`:

| File | Imports |
|------|---------|
| `elections.ts` | `getElections, type Election` + `getAutocomplete` from `api-game.js` |
| `election.ts` | `getRace, type RaceDetailResponse` + `getAutocomplete` from `api-game.js` |
| `calendar.ts` | `getElections` from `api-politics.js` + `getTurnStatus` from `api-game.js` |
| `leaderboard.ts` | `getLeaderboard, LeaderboardCharacter, LeaderboardMetric` |
| `party.ts` | `getParty` |
| `party-compare.ts` | `getParty` |
| `predict.ts` | `getPrediction, PredictionPartyEntry` + `ApiError` from `api-base.js` |
| `government.ts` | `getGovernment, type GovernmentOfficial` |
| `news.ts` | `getNews` |
| `state.ts` | `getState` + `getAutocomplete` from `api-game.js` |
| `compare.ts` | `lookupByName, type CharacterResult` + `getAutocomplete` from `api-game.js` |
| `investor.ts` | `lookupByName, lookupByDiscordId` + `getAutocomplete` from `api-game.js` |
| `profile.ts` | `lookupByName, lookupByDiscordId, getCareer, getAchievements, getSyncRoles, type CharacterResult, type CareerEvent, type Achievement` + `getAutocomplete` from `api-game.js` |
| `accept.ts` | `getSyncRoles` |
| `sync-roles.ts` | `getSyncRoles` |

- [ ] **Step 2: Economy commands — update imports**

These files change `"../utils/api.js"` → `"../utils/api-economy.js"`:

| File | Imports |
|------|---------|
| `corporation.ts` | `getCorporationList, getCorporation, getBonds, getFinancials, type CorporationListItem, type CorporationResponse, type BondsResponse, type FinancialsResponse` + `ApiError` from `api-base.js` |
| `bonds.ts` | `getCorporationList, getBonds, type CorporationListItem` + `ApiError` from `api-base.js` |
| `sectors.ts` | `getSectors, SectorType, OwnedSectorsResponse, UnownedSectorsResponse` |
| `marketshare.ts` | `getMarketShare, SectorType, MarketShareResponse` |
| `market.ts` | `getMarketData` |
| `stockpick.ts` | `getStockExchange, getCorporation, type StockListing, type CorporationResponse` |
| `stock-chart.ts` | `getStockChart, getStockChartCorpList, type CorporationListItem` |

- [ ] **Step 3: Game commands — update imports**

| File | Imports |
|------|---------|
| `turn.ts` | `getTurnStatus` from `api-game.js` |
| `blackjack.ts` | `getBlackjackFund, getBlackjackBalance, postBlackjackPlaceWager, postBlackjackResolve, type BlackjackResolveResponse` from `api-game.js` |

- [ ] **Step 4: Utils — update imports**

| File | New import |
|------|-----------|
| `roles.ts` | `type { SyncRolesDetails }` from `"./api-politics.js"` |
| `chartGenerator.ts` | `type { MarketDataResponse, StockChartMarketResponse, StockChartCorpResponse }` from `"./api-economy.js"` |

- [ ] **Step 5: Run typecheck and tests**

Run: `npx tsc --noEmit && npm test`
Expected: Zero type errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: update all imports to use domain-specific API files"
```

---

### Task 9: Delete the barrel and clean up

**Files:**
- Delete: `src/utils/api.ts` (barrel is no longer needed)

- [ ] **Step 1: Delete `src/utils/api.ts`**

```bash
rm src/utils/api.ts
```

- [ ] **Step 2: Grep to verify no remaining imports from `api.js`**

```bash
grep -r "from.*['\"].*\/api\.js['\"]" src/
```

Expected: No results. All imports should now point to `api-base.js`, `api-politics.js`, `api-economy.js`, or `api-game.js`.

- [ ] **Step 3: Run typecheck and tests**

Run: `npx tsc --noEmit && npm test`
Expected: Zero errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete api.ts barrel — all imports now use domain files"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean compilation to `dist/`.

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 3: Verify file structure**

```
src/utils/
├── api-base.ts        (~115 lines — ApiError, semaphore, apiFetch/apiPost)
├── api-politics.ts    (~350 lines — character, elections, government, etc.)
├── api-economy.ts     (~410 lines — corporations, bonds, stocks, etc.)
├── api-game.ts        (~120 lines — turn status, autocomplete, blackjack)
├── formatting.ts      (~80 lines — shared constants and format functions)
├── cooldown.ts        (unchanged)
├── helpers.ts         (unchanged)
├── roles.ts           (updated imports)
├── chartGenerator.ts  (updated imports)
└── ...
```
