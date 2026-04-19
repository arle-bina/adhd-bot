# AHD Discord Bot — API Reference

All endpoints are hosted at `GAME_API_URL` (configured via `.env`). Every request requires the header:

```
X-Bot-Token: <GAME_API_KEY>
```

Exceeding rate limits returns **429** with a `Retry-After` header.

---

## Rate Limit Tiers

| Tier | Used by |
|------|---------|
| `BOT_READ_LIMITS` | Most read-only endpoints |
| `BOT_FINANCIAL_LIMITS` | Market, financials, sectors, stock-chart, sync-roles |
| `BOT_BLACKJACK_LIMITS` | Blackjack wager/resolve |

---

## Endpoints

### GET `/api/discord-bot/autocomplete`

Prefix-search for use in slash command autocomplete handlers.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | string | ✓ | `"characters"` or `"states"` |
| `q` | string | — | Search query (partial, case-insensitive) |
| `limit` | number | — | Max results, default 10, cap 25 |

```ts
{ results: Array<{ id: string; name: string }> }
```

---

### GET `/api/discord-bot/lookup`

Character lookup by name or Discord ID.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | one-of | Partial match, up to 5 results |
| `discordId` | string | one-of | Exact match |

```ts
{
  found: boolean;
  characters: Array<{
    id: string; name: string; bio: string | null;
    party: string; partyId: string; partyColor: string;
    partyUrl: string | null;
    state: string; stateCode: string; stateUrl: string;
    countryId: string | null; countryUrl: string | null;
    position: string; officeType: string | null;
    politicalInfluence: number; nationalInfluence: number;
    favorability: number; infamy: number;
    funds: number; actions: number; donorBaseLevel: number;
    policies: { economic: number; social: number };
    avatarUrl: string | null; discordAvatarUrl: string | null; discordUsername: string | null;
    profileUrl: string; createdAt: string | null;
    activeElection: { electionId: string; electionType: string; electionState: string; enteredAt: string } | null;
    isCeo: boolean; ceoOf: string | null;
    isInvestor: boolean; portfolioValue: number; investorRank: 1 | 2 | 3 | null;
  }>;
}
```

---

### GET `/api/discord-bot/leaderboard`

Top politicians ranked by a chosen metric.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `metric` | string | — | `"influence"` (default), `"favorability"`, `"nationalPoliticalInfluence"`, `"actions"`, `"funds"` |
| `country` | string | — | Filter by country code (e.g. `"US"`, `"UK"`) |
| `limit` | number | — | Default 10, cap 25 |

```ts
{
  found: boolean;
  metric: string;  // canonical metric name echoed back
  characters: Array<{
    rank: number; id: string; name: string;
    party: string; partyColor: string; stateCode: string; position: string;
    politicalInfluence: number; nationalPoliticalInfluence: number;
    favorability: number; actions: number; funds: number;
    profileUrl: string;
  }>;
}
```

---

### GET `/api/discord-bot/party`

Party detail by sequential ID.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | ✓ | Party sequential ID (numeric, e.g. `"1"`) |
| `country` | string | — | Default `"US"` |

```ts
{
  found: boolean;
  party?: {
    id: string; name: string; abbreviation: string; color: string;
    economicPosition: number;  // -5 to +5
    socialPosition: number;    // -5 to +5
    memberCount: number; treasury: number; chairName: string | null;
    partyUrl: string;
    topMembers: Array<{ id: string; name: string; position: string; politicalInfluence: number; profileUrl: string }>;
  };
}
```

---

### GET `/api/discord-bot/elections`

Active and upcoming elections, with optional filters.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `country` | string | — | Filter by country code |
| `state` | string | — | Filter by state ID (e.g. `"CA"`, `"UK_ENG"`) |

```ts
{
  found: boolean;
  elections: Array<{
    id: string; seatId: string | null;
    electionType: string;  // "house", "senate", "president", "commons", etc.
    state: string; status: "upcoming" | "active" | "completed";
    startTime: string | null; endTime: string | null;
    candidates: Array<{ characterId: string; characterName: string; party: string; partyColor: string }>;
  }>;
}
```

---

### GET `/api/discord-bot/race`

Detailed view of one or more elections. Pass `electionId` for single-race detail, or `country`/`state`/`race` for a filtered list.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `electionId` | string | one-of | Direct lookup; returns detail mode |
| `country` | string | one-of | Returns list mode |
| `state` | string | — | Narrow list mode by state |
| `race` | string | — | Narrow list mode by race type |

**List mode response:**
```ts
{ found: true; mode: "list"; elections: Array<{ id: string; electionType: string; state: string; stateName: string; status: string; startTime: string | null; endTime: string | null }> }
```

**Detail mode response:**
```ts
{
  found: true; mode: "detail";
  election: { id: string; electionType: string; state: string; stateName: string; countryId: string; cycle: number; status: string; totalSeats: number | null; startTime: string | null; endTime: string | null; primaryEndTime: string | null; url: string };
  phase: { inPrimary: boolean; inGeneral: boolean; isUpcoming: boolean; isEnded: boolean };
  incumbent?: { name: string; party: string } | null;
  candidates: Array<{
    id: string; characterId: string | null; characterName: string; avatarUrl: string | null;
    party: string; partyId: string; partyColor: string; isNPP: boolean;
    favorability: number; politicalInfluence: number;
    economicPosition: number; socialPosition: number;  // -5 to +5
    primaryScore: number; sharePct: number;
    endorsementCount: number; endorsements: Array<{ type: string; name: string }>;
    runningMateName: string | null; campaignFunds: number | null; profileUrl: string | null;
  }>;
  primarySnapshots: Array<{ recordedAt: number; byParty: Record<string, number> }>;
  votes: { totalVotes: Record<string, number>; candidateNames: Record<string, string>; candidateParties: Record<string, string>; finalized: boolean } | null;
  gameState: { currentTurn: number; isActive: boolean } | null;
}
```

---

### GET `/api/discord-bot/predict`

Projected seat distribution for a legislature.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `country` | string | ✓ | `"US"`, `"UK"`, `"CA"`, `"DE"`, `"JP"` |
| `race` | string | — | US: `"senate"`, `"house"`. UK/CA: `"commons"`. DE: `"bundestag"`. JP: `"shugiin"`, `"sangiin"`. Defaults to the only option if unambiguous. |

```ts
{
  found: boolean; country: string; countryName: string;
  race: string; chamberName: string; totalSeats: number; inGeneral: boolean;
  activeSenateClass?: string;  // only for senate
  cycle?: number;              // only for senate
  current: Array<{ party: string; partyName: string; partyColor: string; seats: number }>;
  projected: Array<{ party: string; partyName: string; partyColor: string; seats: number }>;
}
```

---

### GET `/api/discord-bot/government`

Current government officials for a country.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `country` | string | — | Default `"US"`. Supported: `"US"`, `"UK"`, `"CA"`, `"DE"`, `"JP"` |

```ts
{
  found: boolean; country: string; countryName: string;
  officials: Array<{
    role: string;  // e.g. "President", "Prime Minister", "Speaker of the House"
    section: "executive" | "leadership" | "cabinet";
    characterId: string | null; characterName: string | null;
    party: string | null; partyColor: string;
    profileUrl: string | null; isNPP: boolean;
  }>;
}
```

---

### GET `/api/discord-bot/news`

Recent news posts.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `limit` | number | — | Default 5, cap 10 |
| `category` | string | — | `"election"`, `"legislation"`, `"executive"`, `"general"` |

```ts
{
  found: boolean;
  posts: Array<{
    id: string; title: string | null;
    content: string;     // truncated to 200 chars
    authorName: string; isSystem: boolean;
    category: string | null; stateId: string | null;
    reactions: Record<string, number>;
    createdAt: string; postUrl: string;
  }>;
}
```

---

### GET `/api/discord-bot/country/[code]/region`

State or region detail within a country.

| Route param | Notes |
|-------------|-------|
| `code` | Country code: `"US"`, `"UK"`, `"CA"`, `"DE"`, `"JP"` |

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | ✓ | State ID, e.g. `"CA"`, `"UK_ENG"` |

```ts
{
  found: boolean;
  state?: {
    id: string; name: string; region: string;
    population: number; votingSystem: string; stateUrl: string;
    officials: Array<{
      officeType: string; characterId: string | null; characterName: string | null;
      party: string; partyColor: string; isNPP: boolean;
    }>;
  };
}
```

---

### GET `/api/discord-bot/corporation`

Corporation lookup. Pass `name` for full detail, `list=true` for all names (autocomplete).

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | one-of | Case-insensitive exact match |
| `list` | string | one-of | `"true"` — returns name list only |

**List mode:**
```ts
{ corporations: Array<{ id: string; name: string }> }
```

**Detail mode:**
```ts
{
  found: boolean;
  corporation: {
    id: string; sequentialId?: number; name: string; description: string | null;
    type: string; typeLabel: string; brandColor: string | null; logoUrl: string | null;
    headquartersState: string; headquartersStateName: string;
    liquidCapital: number; sharePrice: number; totalShares: number;
    publicFloat: number; publicFloatPct: number; marketCapitalization: number;
    marketingBudget: number; marketingStrength: number; marketingStrengthGrowth: number;
    ceoSalary: number; dividendRate: number; corpUrl: string; countryId: string;
  };
  ceo: { name: string; profileUrl: string } | null;
  shareholders: Array<{ name: string; shares: number; percentage: number }>;
  financials: {
    totalRevenue: number; maintenanceCosts: number; growthCosts: number;
    marketingCosts: number; logisticsCosts: number; ceoSalaryCost: number;
    operatingCosts: number; operatingIncome: number;
    bondInterestCost: number; totalCosts: number; income: number;
    dailyDividendPayout: number; retainedEarnings: number;
  };
  balanceSheet: {
    totalAssets: number; cashOnHand: number; sectorNPV: number;
    totalDebt: number; bookValue: number; totalEquity: number; marketCapitalization: number;
  };
  creditRating: { rating: string; compositeScore: number; effectiveCouponRate: number };
  bonds: Array<{ id: string; couponRate: number; maturityLabel: string; totalIssued: number; marketPrice: number; turnsRemaining: number; defaulted: boolean }>;
  sectors: Array<{ stateId: string; stateName: string; revenue: number; growthRate: number; workers: number }>;
}
```

---

### GET `/api/discord-bot/financials`

Detailed financial statements for a corporation.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✓ | Corporation name (case-insensitive) |

```ts
{
  found: boolean;
  corporation?: { name: string; type: string; typeLabel: string; brandColor: string | null; logoUrl: string | null; headquartersStateName: string; ceo: string | "Vacant"; corpUrl: string; countryId: string };
  incomeStatement?: {
    totalRevenue: number;
    costs: { maintenance: number; growth: number; marketing: number; logistics: number; ceoSalary: number; operatingTotal: number; bondInterest: number; grandTotal: number };
    operatingIncome: number; netIncome: number; dividendRate: number; dailyDividendPayout: number; retainedEarnings: number;
  };
  balanceSheet?: {
    assets: { cashOnHand: number; sectorNPV: number; totalAssets: number };
    liabilities: { outstandingDebt: number; bondCount: number; annualInterestObligation: number; dailyInterestCost: number };
    equity: { bookValue: number };
  };
  shareStructure?: {
    totalShares: number; publicFloat: number; publicFloatPct: number;
    sharePrice: number; marketCapitalization: number;
    shareholders: Array<{ name: string; shares: number; percentage: number; value: number }>;
  };
  creditRating?: { rating: string; compositeScore: number; effectiveCouponRate: number; primeRate: number };
  bonds?: Array<{ id: string; bondUrl: string; couponRate: number; maturityLabel: string; totalIssued: number; marketPrice: number; turnsRemaining: number; yieldToMaturity: number; holders: number; defaulted: boolean }>;
  sectorBreakdown?: Array<{ stateId: string; stateName: string; revenue: number; maintenanceCost: number; growthCost: number; profit: number; effectiveMargin: number; growthRate: number; workers: number }>;
}
```

---

### GET `/api/discord-bot/bonds`

Sovereign and corporate bonds.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `corp` | string | — | Filter by corporation name |
| `page` | number | — | Default 1 |

```ts
{
  found: boolean; filterCorp?: string;
  bonds: Array<{
    id: string; bondUrl: string;
    corporationName: string; corporationId: number | string;
    brandColor: string | null; countryId: string | null;
    couponRate: number; maturityLabel: string;
    totalIssued: number; totalUnits: number; publicFloat: number;
    marketPrice: number;      // 0–1 range
    turnsRemaining: number; yieldToMaturity: number;
    defaulted: boolean; holders: number;
  }>;
  totalOutstandingDebt: number;
  pagination: { page: number; perPage: number; totalCount: number; totalPages: number };
}
```

---

### GET `/api/discord-bot/sectors`

Sector ownership or unowned market by industry type.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | string | ✓ | `"financial"`, `"media"`, `"manufacturing"`, `"healthcare"`, `"retail"`, `"automobiles"`, `"technology"`, `"energy"`, `"agriculture"`, `"real_estate"`, `"defense"`, `"telecommunications"`, `"entertainment"` |
| `unowned` | string | — | `"true"` for unowned-market view |
| `page` | number | — | Default 1, pageSize 10 |

**Owned sectors:**
```ts
{
  found: boolean; mode: "owned"; sectorType: string; sectorLabel: string;
  page: number; totalPages: number; totalItems: number; pageSize: number;
  sectors: Array<{
    stateId: string; stateName: string;
    corporationId: string; corporationName: string;
    brandColor: string | null; countryId: string | null;
    corporationSequentialId: number | null;
    revenue: number; growthRate: number; workers: number;
    sectorUrl: string; corporationUrl: string; stateUrl: string;
  }>;
}
```

**Unowned market:**
```ts
{
  found: boolean; mode: "unowned"; sectorType: string; sectorLabel: string;
  page: number; totalPages: number; totalItems: number; pageSize: number;
  sectors: Array<{ stateId: string; stateName: string; countryId: string; totalMarket: number; ownedRevenue: number; unownedRevenue: number }>;
}
```

---

### GET `/api/discord-bot/marketshare`

Market share breakdown for a sector, optionally scoped to a country or state.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | string | ✓ | Same values as `/sectors` |
| `country` | string | — | Country code |
| `state` | string | — | State ID (overrides `country`) |
| `page` | number | — | Default 1, pageSize 15 |

```ts
{
  found: boolean; sectorType: string; sectorLabel: string;
  scope: { country: string | null; stateId: string | null; stateName: string | null };
  totalMarket: number; totalOwnedRevenue: number; unownedRevenue: number; unownedPercent: number;
  page: number; totalPages: number; totalItems: number; pageSize: number;
  companies: Array<{
    corporationId: string; corporationName: string;
    corporationSequentialId: number | null; brandColor: string | null; countryId: string | null;
    revenue: number; marketSharePercent: number; isNatcorp: boolean;
  }>;
}
```

---

### GET `/api/discord-bot/stock-chart`

Historical price/market-cap data for charting.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `corp` | string | one-of | Corporation name |
| `country` | string | one-of | `"global"`, `"us"`, `"uk"`, `"ca"`, `"de"`, `"jp"` for market-wide data |
| `limit` | number | — | Max history points, default 100, cap 500 |

**Corporation mode:**
```ts
{ found: true; mode: "corporation"; corporation: { name: string; sequentialId?: number; type: string; countryId: string }; points: Array<{ turn: number; sharePrice: number; marketCap: number; revenue: number; income: number; timestamp: Date }> }
```

**Market mode:**
```ts
{ found: true; mode: "market"; exchange: string; points: Array<{ turn: number; marketCap: number; bySector: Record<string, number>; timestamp: Date }> }
```

---

### GET `/api/discord-bot/achievements`

Earned achievements for a character.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `characterId` | string | one-of | MongoDB ObjectId |
| `discordId` | string | one-of | Discord user ID |
| `name` | string | one-of | Partial name match |

```ts
{
  found: boolean; characterId?: string; characterName?: string;
  achievements: Array<{
    id: string; name: string; description: string; icon: string;
    category: string; isHidden: boolean; isHighlighted: boolean; earnedAt: string;
  }>;
}
```

---

### GET `/api/discord-bot/career`

Career history for a character.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `characterId` | string | one-of | MongoDB ObjectId |
| `discordId` | string | one-of | Discord user ID |
| `name` | string | one-of | Partial name match |

```ts
{
  found: boolean; characterId?: string; characterName?: string;
  career: Array<{
    type: string; office: string; officeRaw: string;
    party: string | null; electionId: string | null; date: string;
  }>;
}
```

---

### GET `/api/discord-bot/sync-roles`

Role metadata for a single Discord user.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `discordId` | string | ✓ | Discord user ID |

```ts
{
  found: boolean; discordId?: string; characterName?: string;
  roles: string[];  // e.g. ["party:Republican", "country:US", "office:Representative"]
  details?: {
    party: string; partyName: string; partyColor: string | null;
    country: string; office: string | null; officeName: string | null;
    isCeo: boolean; isInvestor: boolean; portfolioValue: number; investorRank: number | null;
  };
}
```

---

### POST `/api/discord-bot/sync-roles`

Bulk role data for all linked users (used for server-wide role sync). Rate-limited to 10 req/60 s.

No request body required.

```ts
{
  users: Array<{
    discordId: string; characterName: string; roles: string[];
    details: { party: string; partyName: string; partyColor: string | null; country: string; office: string | null; officeName: string | null; isCeo: boolean; isInvestor: boolean; portfolioValue: number; investorRank: number | null };
  }>;
}
```

---

## Blackjack Endpoints

### GET `/api/discord-bot/blackjack/balance`

Player's liquid capital.

| Param | Type | Required |
|-------|------|----------|
| `discordId` | string | ✓ |

```ts
{ success: boolean; discordId: string; characterId: string; characterName: string; countryId: string; cashOnHand: number }
```

---

### GET `/api/discord-bot/blackjack/fund`

Prize pool status.

```ts
{ found: boolean; balance: number; totalWagered?: number; totalPaidOut?: number; totalCollected?: number; gamesPlayed?: number; message?: string }
```

---

### POST `/api/discord-bot/blackjack/init-fund`

Initialize the prize pool (one-time). Returns 409 if already initialized.

```ts
{ success: boolean; message: string; initialBalance: number; fundId: string }
```

---

### POST `/api/discord-bot/blackjack/place-wager`

Deduct wager from a player's funds.

```ts
// Body
{ discordId: string; wagerAmount: number; gameId?: string }

// Response
{ success: boolean; gameId: string; discordId: string; characterId: string; characterName: string; countryId: string; wagerAmount: number; previousCash: number; newCash: number; message: string }
```

Errors: 402 (insufficient funds, includes `shortAmount`), 403 (banned), 404 (not found).

---

### POST `/api/discord-bot/blackjack/resolve`

Resolve a pending wager (win / loss / push).

```ts
// Body
{ discordId: string; gameId: string; result: "win" | "loss" | "push"; payoutMultiplier?: number }

// Response
{ success: boolean; discordId: string; gameId: string; characterId: string; characterName: string; countryId: string; wagerAmount: number; result: string; payoutMultiplier?: number; houseEdge?: number; payout?: number; totalReturned?: number; previousCash: number; newCash: number; previousPoolBalance: number; newPoolBalance: number; gamesPlayed: number }
```

Errors: 404 (pending wager not found), 503 (pool uninitialized or insufficient).

---

### POST `/api/discord-bot/blackjack/wager` *(deprecated)*

Single-step wager + resolve. Prefer `/place-wager` + `/resolve` for atomic game flows.

---

## Notes

- Position values (`economicPosition`, `socialPosition`, character `policies`) are on a **−5 to +5** scale.
- `marketPrice` on bonds is a **0–1** multiplier (e.g. `0.97` = trading at 97 cents on the dollar).
- `favorability` is **0–100**.
- `funds` on characters refers to campaign funds; `cashOnHand` / `liquidCapital` refers to personal cash.
- All timestamps are ISO 8601 strings unless noted as `Date`.
- `profileUrl`, `corpUrl`, `partyUrl`, `bondUrl`, `stateUrl` are absolute URLs using `NEXT_PUBLIC_BASE_URL`.
