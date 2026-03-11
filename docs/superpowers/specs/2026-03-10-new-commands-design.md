# New Slash Commands Design
**Date:** 2026-03-10
**Project:** A House Divided Discord Bot

## Overview

Add 5 new slash commands: `/leaderboard`, `/party`, `/elections`, `/state`, `/news`. All follow the existing `/profile` pattern: `deferReply` → API call → `editReply` with embeds.

## File Structure

### New files
- `src/commands/leaderboard.ts`
- `src/commands/party.ts`
- `src/commands/elections.ts`
- `src/commands/state.ts`
- `src/commands/news.ts`
- `src/utils/helpers.ts` — exports `hexToInt(hex: string): number`

### Modified files
- `src/utils/api.ts` — 5 new typed API functions
- `src/index.ts` — import and register all 5 new commands
- `src/register.ts` — add all 5 command definitions to the registration array

## Shared Utilities

`src/utils/helpers.ts`:
```ts
export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}
```

Used by leaderboard, party, elections, state, and news commands.

## API Functions (api.ts additions)

Each follows the existing pattern: build URL, fetch with `X-Bot-Token: process.env.GAME_API_KEY`, throw on non-ok, return typed JSON.

- `getLeaderboard(params)` → `GET /api/discord-bot/leaderboard`
- `getParty(id)` → `GET /api/discord-bot/party?id=<id>`
- `getElections(params)` → `GET /api/discord-bot/elections`
- `getState(id)` → `GET /api/discord-bot/state?id=<id>`
- `getNews(params)` → `GET /api/discord-bot/news`

## Error Handling

API functions throw `new Error(\`API error: ${response.status}\`)`. Command handlers catch and produce ephemeral messages:

| Status | Message |
|--------|---------|
| 401 | "Bot configuration error — contact an admin." |
| 400 | "Invalid request — check your inputs." |
| Network/other | "Could not reach the game server. Try again shortly." or "Something went wrong. Try again shortly." |

`found: false` responses return ephemeral "not found" messages per the spec.

## Command Designs

### /leaderboard
- Options: `metric` (influence/favorability, default influence), `country` (US/UK), `limit` (1–25, default 10)
- Single embed, color `0x2b2d31`, title `🏆 Top Politicians — [Metric]`
- Description: numbered list, one politician per line with position, party, and metric value
- Footer: `ahousedivided.com` + country filter if applied

### /party
- Options: `id` (required party slug)
- Single embed, color from `party.color`, title `[ABBR] Party Name`
- Fields: Chair, Members, Treasury, Ideology (compass from economic/social positions), Top Members (up to 5)

### /elections
- Options: `country`, `state` (both optional)
- Single embed, color `0x5865F2`, title `🗳️ Active & Upcoming Elections`
- Shows up to 5 soonest elections with `<t:UNIX:R>` timestamps
- Footer shows "Showing 5 of N" if truncated

### /state
- Options: `id` (required state/region code)
- Single embed, color `0x57F287`, title `🏛️ State Name`
- Fields: Region, Population, Voting System, Officials (grouped by office type)

### /news
- Options: `category` (optional), `limit` (1–10, default 5)
- Single embed, color `0xFEE75C`, title `📰 Latest News [— Category]`
- One embed field per post: title/author as field name, content + reactions + timestamp as value

## index.ts & register.ts

- Keep existing `Collection<string, typeof profileCommand>` typing
- Import each new command as `* as commandName` and add to collection/registration array
