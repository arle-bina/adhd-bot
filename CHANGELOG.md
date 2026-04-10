# Changelog

All notable changes to the AHD Discord Bot are documented here.

---

## Unreleased

### Added

- `/accept` now also assigns the Beta Tester role (`BETA_TESTER_ROLE_ID`) alongside Member and Alpha Tester, so every newly verified member becomes a beta tester automatically.
- `/sync-roles beta-update:true` — one-off backfill that assigns the Beta Tester role to every non-bot member that doesn't already have it. Without the option, `/sync-roles` still runs the normal game-role sync.

### Changed

- `BETA_TESTER_ROLE_ID` added to the protected role list in `utils/roles.ts` so the regular sync never strips it.

---

## [1.5.0] — 2026-04-04

### Added

- `/blackjack` — `pool` subcommand shows the shared prize pool balance and stats from `GET /api/discord-bot/blackjack/fund`. `play` subcommand runs a full hand with Hit / Stand buttons; outcomes settle via `POST /api/discord-bot/blackjack/wager` (natural blackjack uses `payoutMultiplier: 1.5`; pushes do not call the API). API helpers in `api.ts`: `getBlackjackFund()`, `postBlackjackWager()`, related types.
- `src/utils/blackjackGame.ts` — shoe creation, hand totals, dealer-stands-on-all-17s rule, shared by the command.
- Vitest coverage for `blackjackGame` (`tests/utils/blackjackGame.test.ts`) — hand totals, blackjack detection, dealer hit/stand, shoe size, empty-shoe guard.

### Changed

- `/sectors` — sector links for owned rows use `GAME_API_URL` origin so embed links match the configured game site when the API returns a mismatched base URL. Unowned rows link state names to `/state/{id}` on the same origin.

### Fixed

- `chartGenerator.ts` — Chart.js v4 typings satisfied (`type` literals, title font weight, `ChartConfiguration` assertions; candlestick config uses a safe double cast where the dataset shape is non-standard).

---

## [1.4.0] — 2026-03-19

### Added

- `/bonds` — standalone bond market browser. Browse all active bonds across corporations with coupon rates, market prices, yield-to-maturity, and maturity timelines. Supports corporation filter (autocomplete) and pagination.
- `/corporation view:Bonds` — view a corporation's outstanding debt instruments with coupon, price, YTM, and turns remaining.
- `/corporation view:Financials` — full financial statement: code-block income statement, balance sheet, share structure, credit rating breakdown (D/E, IC, profitability, liquidity), coupon rate, outstanding bonds, and sector P&L.
- `/corporation` overview now shows shareholders, public float, dividends, credit rating, debt summary, and marketing stats alongside the existing fields.
- Bond and financial API types added to `api.ts`: `BondEntry`, `BondsResponse`, `FinancialsResponse`, `getBonds()`, `getFinancials()`.
- Help registry updated with `/bonds` entry and expanded `/corporation` description.

### Changed

- `/predict` redesigned — single embed with projected vs current seats side-by-side (inline fields) instead of paginated buttons. Hemicycle parliament chart (half-doughnut) with fallback color palette for null party colours.
- `/election` rewritten to use `/api/discord-bot/race` endpoint. Supports both list and detail modes with interactive select menu and back button. Fixes null profile links, rounds all numbers, handles unopposed candidates, removes endorsements.
- `/corporation` now uses button tabs (Overview, Bonds, Financials) instead of a single static embed. Overview loads first; clicking a tab fetches and caches that view's data.

### Removed

- `/me` and `/compare` commands removed.

### Fixed

- Predict chart no longer renders as one colour when party colours are null — uses a 15-colour fallback palette.
- Predict `totalSeats` fallback when API returns 0 — now derives from sum of projected/current entries.
- Election embed no longer shows `[name](null)` for candidates without profile URLs.
- Election numbers (favorability, PI, primary score, campaign funds) properly rounded and null-guarded.

---

## [1.3.0] — 2026-03-11

### Added

- `/me` — view your own character profile. Auto-resolves via the caller's Discord ID (reuses existing `/api/discord-bot/lookup?discordId=`). Response is ephemeral. No new API route needed.
- `/turn` — current game turn, game year, year progress, last processed time, and next scheduled turn, all as Discord-native relative timestamps. Calls the public `/api/game/turn/status` endpoint (no auth header required).
- `/compare` — side-by-side two-column embed comparing two politicians (office, party, state, profile links). Fetches both via `Promise.all` against the existing lookup endpoint. No new API route needed.
- `getTurnStatus()` added to `api.ts` for the public turn status endpoint.
- `/me`, `/compare` added to Players category in `helpRegistry.ts`; `/turn` added to World category.
- Unit test suite via **Vitest** — 33 tests across 5 files covering all pure utility and formatting functions (`hexToInt`, `errorMessage`, `getMetricValue`, `ideologyLabel`, `formatElectionType`, `formatOfficeType`). Run with `npm test`.
- `vitest.config.ts` added at project root.

---

## [1.2.0] — 2026-03-11

### Added

- Per-user command cooldowns enforced centrally in `index.ts`. Each command opts in via `export const cooldown = N` (seconds). Default fallback of 3s. Leaderboard is 10s; all other API commands are 5s.
- Dynamic command loader in `index.ts` and `register.ts` — commands are auto-discovered from `src/commands/` at startup. Adding a new command no longer requires manual imports in either file.
- `src/utils/cooldown.ts` — in-memory cooldown tracker (`Map<userId:command, timestamp>`).
- ESLint with `typescript-eslint` — `npm run lint` and `npm run lint:fix`. Config in `eslint.config.js`.

### Changed

- `leaderboard`, `party`, `elections`, `state`, `news` — all now call `deferReply()` before hitting the game API, buying 15 minutes of response time instead of 3 seconds. Eliminates silent timeout failures under slow API conditions. Error handling simplified as a result (always `editReply`, no `replied || deferred` branch needed).
- `WELCOME_CHANNEL_ID`, `RULES_CHANNEL_ID`, and `MEMBER_ROLE_ID` moved from hardcoded source literals to environment variables. All three are now required and validated on startup. Update your `.env` accordingly.
- `package.json` version bumped to `1.2.0`.

### Fixed

- `/help` registry had incorrect usage for `/party` (`name` → `id`).

---

## [1.1.0] — 2026-03-11

### Added

- `/accept` — server onboarding command. Assigns the member role after the user reads the rules. Idempotent (safe to run more than once).
- Automatic welcome message on `guildMemberAdd` — sends an embed to the welcome channel prompting new members to read the rules and run `/accept`. Requires `GuildMembers` intent.
- `/help` — interactive help menu using a Discord select menu. Overview embed lists all categories; selecting one updates the message in-place with per-command usage, descriptions, and examples.
- `src/utils/helpRegistry.ts` — single source of truth for all help menu metadata, grouped by category (Players, Politics, World). Adding a new command to the help menu only requires editing this file.

---

## [1.0.0] — 2026-03-10

### Added

- `/profile` — Look up a player's characters by name or linked Discord user. Returns embeds with position, party, state, avatar, and a direct link button to the profile page.
- `/leaderboard` — Top politicians ranked by political influence or favorability, filterable by country (US / UK) with configurable result count (max 25).
- `/party` — Look up a political party by name.
- `/elections` — Active and upcoming elections with candidate lists and Discord-native countdown timestamps, filterable by country and state/region.
- `/state` — State or region overview showing name, region, population, voting system (RCV or FPTP), and current office holders.
- `/news` — Latest in-game news posts with reactions and timestamps, filterable by category (Elections, Legislation, Executive, General) and configurable limit (max 10).
- Centralised game API client (`src/utils/api.ts`) used across all commands.
- Environment validation on startup (`src/utils/env.ts`) — bot will not start with missing required variables.
- PM2 process management via `ecosystem.config.cjs` with auto-restart, memory cap (500 MB), and log aggregation.
- `scripts/setup.sh` — first-time Oracle Cloud Ubuntu setup (Node.js, PM2, build, register, start).
- `scripts/deploy.sh` — one-command update and restart workflow.
- Slash command registration script (`src/register.ts`) for pushing commands to the Discord API.
