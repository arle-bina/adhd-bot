# CLAUDE.md — AHD Discord Bot

Project context for Claude Code sessions.

---

## What this project is

Discord companion bot for **A House Divided** (`ahousedividedgame.com`), a browser-based political simulation. The bot exposes live game data (politicians, elections, news, states, parties) via Discord slash commands by calling the game's REST API.

---

## Vision

This bot should feel like a natural extension of the game — fast, readable, and reliable. Players shouldn't need to think about it; it just works. As the game grows (more countries, more office types, more events), the bot should scale with it without requiring structural rewrites.

The guiding principles:

- **One concern per file.** Each command owns its own presentation logic. Shared logic (API calls, error formatting, embed helpers) lives in `utils/` and is imported, never duplicated.
- **Thin commands, fat utilities.** Commands should mostly orchestrate: call the API, format the result, reply. If logic is getting complex inside a command handler, it probably belongs in a helper.
- **Fail gracefully, always.** Every command must handle API errors without crashing. Use `errorMessage()` from helpers and reply ephemerally on failure. Never let an unhandled rejection surface to the user as silence.
- **Embed consistency.** Embeds should feel cohesive across commands — consistent use of colour, footer attribution (`ahousedividedgame.com`), Discord timestamps (`<t:unix:R>`), and truncation guards (field values capped at 1024 chars, titles at 256).
- **Don't over-fetch.** Respect the `limit` options users provide. Slice API results before building embeds, not after. If the API returns 100 results and we show 10, we should only request 10.
- **Register intentionally.** `npm run register` hits the Discord API — don't run it on every deploy, only when command definitions actually change.

---

## Tech stack

- **discord.js v14** — bot framework
- **TypeScript 5.3** — language (`src/`, compiled to `dist/`, strict mode)
- **tsx** — dev runner (`npm run dev` watches `src/index.ts`)
- **Vitest** — unit testing framework (`tests/`)
- **ESLint + typescript-eslint** — linting (`eslint.config.js`)
- **Node.js v20+**
- **PM2** — production process manager (`ecosystem.config.cjs`)
- **dotenv** — env loading

---

## Key scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Run in watch mode via tsx |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled `dist/index.js` |
| `npm run register` | Push slash commands to Discord API |
| `npm run lint` | Lint `src/` with ESLint |
| `npm run lint:fix` | Lint and auto-fix |
| `npm test` | Run test suite once via Vitest |
| `npm run test:watch` | Run tests in watch mode |
| `bash scripts/setup.sh` | First-time server setup (Ubuntu / Oracle Cloud) |
| `bash scripts/deploy.sh` | Pull + build + PM2 restart |

---

## Project structure

```
src/
  commands/              # One file per slash command (11 commands)
    accept.ts            #   /accept — assign member role
    compare.ts           #   /compare — side-by-side politician comparison
    elections.ts         #   /elections — active/upcoming elections
    help.ts              #   /help — interactive help menu
    leaderboard.ts       #   /leaderboard — top politicians by metric
    me.ts                #   /me — caller's linked characters
    news.ts              #   /news — latest game news
    party.ts             #   /party — party details & ideology
    profile.ts           #   /profile — politician lookup by name or Discord user
    state.ts             #   /state — state info & officials
    turn.ts              #   /turn — current game turn status
  utils/
    api.ts               # All game API calls & response types (single source of truth)
    cooldown.ts          # Per-user, per-command cooldown tracking (in-memory Map)
    env.ts               # Validates required env vars on startup
    helpRegistry.ts      # Help menu metadata — categories & command descriptions
    helpers.ts           # Shared utilities (hexToInt, errorMessage)
  index.ts               # Client setup, auto-discovers commands, routes interactions
  register.ts            # Auto-discovers & registers slash commands with Discord
tests/
  commands/              # Unit tests for command helper functions
    elections.test.ts    #   formatElectionType tests
    leaderboard.test.ts  #   getMetricValue tests
    party.test.ts        #   ideologyLabel tests
    state.test.ts        #   formatOfficeType tests
  utils/
    helpers.test.ts      #   hexToInt, errorMessage tests
scripts/
  setup.sh               # First-time Oracle Cloud server setup
  deploy.sh              # Pull + build + PM2 restart
```

---

## Code etiquette

- All source is TypeScript — no `any`, no implicit `any`. If the game API shape is uncertain, define an explicit type in `api.ts`.
- Command file exports: `data` (SlashCommandBuilder), `execute(interaction)`, and optionally `cooldown` (seconds). Helper functions may also be exported for testing (e.g. `formatElectionType`, `ideologyLabel`).
- Keep `index.ts` mechanical — it auto-discovers commands and routes interactions. No business logic lives there.
- `api.ts` is the single source of truth for game API shape. All fetch calls go here. Commands never call `fetch` directly.
- Error handling follows the pattern already established: check `interaction.replied || interaction.deferred` before choosing between `reply` and `followUp`.
- Prefer `deferReply()` on commands that make API calls — it buys 15 minutes instead of 3 seconds and prevents timeout errors under load.

---

## Adding a new command

1. Create `src/commands/<name>.ts` exporting `data` (SlashCommandBuilder) and `execute(interaction)`.
2. Optionally export `cooldown` (number of seconds; default is 3).
3. Run `npm run register` to push to Discord.

Commands are **auto-discovered** — `index.ts` and `register.ts` both scan `src/commands/` at startup. No manual imports needed.

If the command calls the game API, add the fetch function and response types to `src/utils/api.ts` first.

If the command should appear in `/help`, add its metadata to `src/utils/helpRegistry.ts`.

---

## Command cooldowns

Cooldowns are per-user, per-command, enforced centrally in `index.ts` via `checkCooldown()` from `utils/cooldown.ts`.

| Command | Cooldown |
| --- | --- |
| `/accept`, `/help` | 3s (default) |
| `/profile`, `/me`, `/compare`, `/elections`, `/party`, `/state`, `/news` | 5s |
| `/leaderboard`, `/turn` | 10s |

Set via `export const cooldown = N` in the command file.

---

## Testing

33 unit tests via Vitest. Tests cover pure helper functions exported from command files and utilities — no Discord mocking required.

Run tests: `npm test`
Watch mode: `npm run test:watch`

When adding new formatter/helper functions to commands, export them and add corresponding tests in `tests/commands/<name>.test.ts`.

---

## Game API endpoints

All requests go through `src/utils/api.ts`. Base URL: `GAME_API_URL` (default `https://www.ahousedividedgame.com/`).

| Endpoint | Auth | Used by |
| --- | --- | --- |
| `GET /api/discord-bot/lookup?name=&discordId=` | X-Bot-Token | /profile, /me, /compare |
| `GET /api/discord-bot/leaderboard?metric=&country=&limit=` | X-Bot-Token | /leaderboard |
| `GET /api/discord-bot/party?id=` | X-Bot-Token | /party |
| `GET /api/discord-bot/elections?country=&state=` | X-Bot-Token | /elections |
| `GET /api/discord-bot/state?id=` | X-Bot-Token | /state |
| `GET /api/discord-bot/news?category=&limit=` | X-Bot-Token | /news |
| `GET /api/game/turn/status` | None (public) | /turn |

---

## Environment variables (see `.env.example`)

- `DISCORD_BOT_TOKEN` — bot authentication token
- `DISCORD_CLIENT_ID` — bot application ID
- `GAME_API_URL` — game API base URL (defaults to `https://www.ahousedividedgame.com/`)
- `GAME_API_KEY` — sent as `X-Bot-Token` header to game API
- `WELCOME_CHANNEL_ID` — channel for automatic welcome messages on member join
- `RULES_CHANNEL_ID` — referenced in welcome embed
- `MEMBER_ROLE_ID` — role assigned by `/accept` command

All are validated at startup by `utils/env.ts`. The bot exits with a clear error if any are missing.

---

## Scaling guidelines

When adding support for new countries, office types, or election formats:

- Add new values to the type maps in the relevant command file (e.g. `formatElectionType`, `formatOfficeType`) — don't add fallback strings in the embed itself.
- If a new command shares significant logic with an existing one, extract that logic into `utils/` first.
- If commands start needing shared embed styling (colours, footers, thumbnails), create `utils/embeds.ts` rather than copy-pasting.
- If the number of commands grows large, consider organising `src/commands/` into subdirectories by domain (e.g. `politics/`, `world/`, `player/`) and updating the loader in `index.ts` accordingly.
- Guild-specific commands (for testing) should be registered separately and never committed to the main registration list.

---

## Deployment

Oracle Cloud Ubuntu instance. PM2 manages the process; `scripts/deploy.sh` is the standard update flow. Logs go to `logs/error.log` and `logs/out.log`. Memory limit: 500MB (auto-restart).

---

## Related repos

- **a-house-divided** — main game (Next.js / React / MongoDB)
- **ahd-client** — Electron desktop client
