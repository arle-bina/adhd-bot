# CLAUDE.md — AHD Discord Bot

Project context for Claude Code sessions.

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

## Code etiquette

- All source is TypeScript — no `any`, no implicit `any`. If the game API shape is uncertain, define an explicit type in `api.ts`.
- Exports from command files are exactly two things: `data` (SlashCommandBuilder) and `execute(interaction)`. Nothing else.
- Keep `index.ts` mechanical — it registers commands and routes interactions. No business logic lives there.
- `api.ts` is the single source of truth for game API shape. All fetch calls go here. Commands never call `fetch` directly.
- Error handling follows the pattern already established: check `interaction.replied || interaction.deferred` before choosing between `reply` and `followUp`.
- Prefer `deferReply()` on commands that make API calls — it buys 15 minutes instead of 3 seconds and prevents timeout errors under load.

---

## Scaling guidelines

When adding support for new countries, office types, or election formats:

- Add new values to the type maps in the relevant command file (e.g. `formatElectionType`, `formatOfficeType`) — don't add fallback strings in the embed itself.
- If a new command shares significant logic with an existing one, extract that logic into `utils/` first.
- If commands start needing shared embed styling (colours, footers, thumbnails), create `utils/embeds.ts` rather than copy-pasting.
- If the number of commands grows large, consider organising `src/commands/` into subdirectories by domain (e.g. `politics/`, `world/`, `player/`) and updating the loader in `index.ts` accordingly.
- Guild-specific commands (for testing) should be registered separately and never committed to the main registration list.

## What this project is

Discord companion bot for **A House Divided** (`ahousedividedgame.com`), a browser-based political simulation. The bot exposes live game data (politicians, elections, news, states, parties) via Discord slash commands by calling the game's REST API.

## Tech stack

- **discord.js v14** — bot framework
- **TypeScript 5.3** — language (`src/`, compiled to `dist/`)
- **tsx** — dev runner (`npm run dev` watches `src/index.ts`)
- **Node.js v20+**
- **PM2** — production process manager (`ecosystem.config.cjs`)
- **dotenv** — env loading

## Key scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Run in watch mode via tsx |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled `dist/index.js` |
| `npm run register` | Push slash commands to Discord API |
| `bash scripts/setup.sh` | First-time server setup (Ubuntu / Oracle Cloud) |
| `bash scripts/deploy.sh` | Pull + build + PM2 restart |

## Project structure

```
src/
  commands/         # One file per slash command
  utils/
    api.ts          # All game API calls live here
    env.ts          # Validates required env vars on startup
    helpers.ts      # Shared utilities (e.g. errorMessage())
  index.ts          # Client setup, command registration, interaction handler
  register.ts       # Registers slash commands with Discord
```

## Adding a new command

1. Create `src/commands/<name>.ts` exporting `data` (SlashCommandBuilder) and `execute(interaction)`.
2. Import and register it in `src/index.ts` (two lines: import + `commands.set`).
3. Import and include it in `src/register.ts` commands array.
4. Run `npm run register` to push to Discord.

## Environment variables (see `.env.example`)

- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `GAME_API_URL` — defaults to `https://www.ahousedividedgame.com/`
- `GAME_API_KEY`

## Deployment target

Oracle Cloud Ubuntu instance. PM2 manages the process; `scripts/deploy.sh` is the standard update flow. Logs go to `logs/error.log` and `logs/out.log`.

## Related repos

- **a-house-divided** — main game (Next.js / React / MongoDB)
- **ahd-client** — Electron desktop client
