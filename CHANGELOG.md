# Changelog

All notable changes to the AHD Discord Bot are documented here.

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
