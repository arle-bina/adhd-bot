# :robot: A House Divided — Discord Bot

> Discord companion bot for the A House Divided political simulation — look up politicians, track elections, read in-game news, and more without leaving Discord.

---

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue" alt="version 1.0.0" />
  <img src="https://img.shields.io/badge/last%20commit-recent-green" alt="last commit recent" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome" />
  <img src="https://img.shields.io/badge/license-proprietary-red" alt="license proprietary" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white" alt="discord.js v14" />
  <img src="https://img.shields.io/badge/node-v20%2B-339933?logo=node.js&logoColor=white" alt="node v20+" />
  <img src="https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.3" />
  <img src="https://img.shields.io/badge/PM2-managed-2B037A" alt="PM2 managed" />
</p>

---

## :robot: Overview

**A House Divided** is a browser-based political simulation where players create politicians, compete in elections, form coalitions, pass legislation, and climb from state office to national leadership. The game runs on a turn-based economy (1 turn = 1 real hour) with persistent world state across the US and UK.

This repository contains the **Discord bot** — a companion app that connects to the game's API and exposes live game data via slash commands, so players can check standings, elections, and news without switching to a browser.

---

## :robot: Commands

### Game data

| Command | Description | Options |
| --- | --- | --- |
| `/profile` | View a player's character(s) | `name` (character name), `user` (Discord user) |
| `/leaderboard` | Top politicians by influence or favorability | `metric`, `country`, `limit` |
| `/party` | Look up a political party | `name` |
| `/elections` | Active and upcoming elections | `country`, `state` |
| `/state` | State or region overview with current officials | `id` (e.g. `CA`, `UK_ENG`) |
| `/news` | Latest in-game news posts | `category`, `limit` |

### Server

| Command | Description | Options |
| --- | --- | --- |
| `/accept` | Accept the server rules and gain access to the server | — |
| `/help` | Browse all bot commands via an interactive select menu | — |

The bot also sends an **automatic welcome message** when a new member joins, prompting them to read the rules and run `/accept`.

---

## :robot: Tech Stack

| Layer | Technology |
| --- | --- |
| Bot Framework | discord.js v14 |
| Language | TypeScript 5.3 |
| Runtime | Node.js v20+ |
| Dev Runner | tsx (watch mode) |
| Process Manager | PM2 |
| Game Backend | A House Divided API (hosted remotely) |

---

## :robot: Project Structure

```
adhd-bot/
├── src/
│   ├── commands/
│   │   ├── accept.ts        # /accept command (server onboarding)
│   │   ├── elections.ts     # /elections command
│   │   ├── help.ts          # /help command (interactive menu)
│   │   ├── leaderboard.ts   # /leaderboard command
│   │   ├── news.ts          # /news command
│   │   ├── party.ts         # /party command
│   │   ├── profile.ts       # /profile command
│   │   └── state.ts         # /state command
│   ├── utils/
│   │   ├── api.ts           # Game API client
│   │   ├── env.ts           # Env validation
│   │   ├── helpRegistry.ts  # Help menu command metadata (source of truth)
│   │   └── helpers.ts       # Shared helpers
│   ├── index.ts             # Bot entry point
│   └── register.ts          # Slash command registration
├── scripts/
│   ├── setup.sh             # First-time server setup
│   └── deploy.sh            # Update & restart bot
├── ecosystem.config.cjs     # PM2 configuration
├── .env.example             # Required environment variables
├── tsconfig.json
└── package.json
```

---

## :robot: Getting Started

### Prerequisites

- **Node.js** v20 or later
- **npm** v10 or later
- A Discord bot token and application from the [Discord Developer Portal](https://discord.com/developers/applications)
- **Server Members Intent** enabled in the Discord Developer Portal (Bot → Privileged Gateway Intents) — required for the welcome message flow
- A valid `GAME_API_KEY` from A House Divided

### Installation

```bash
# Clone the repository
git clone https://github.com/Egg3901/adhd-bot.git
cd adhd-bot

# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env
```

### Environment Variables

| Variable | Description |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Your Discord bot token |
| `DISCORD_CLIENT_ID` | Your Discord application client ID |
| `GAME_API_URL` | Game API base URL (default: `https://www.ahousedividedgame.com/`) |
| `GAME_API_KEY` | API key for the game backend |
| `WELCOME_CHANNEL_ID` | Channel ID where welcome messages are sent to new members |
| `RULES_CHANNEL_ID` | Channel ID linked in the welcome message |
| `MEMBER_ROLE_ID` | Role ID assigned by `/accept` |

### Development

```bash
# Run in watch mode (auto-reloads on file changes)
npm run dev
```

### Register Slash Commands

Commands must be registered with Discord before they appear in servers. Run once per deployment or after adding new commands:

```bash
npm run register
```

### Production Build

```bash
# Compile TypeScript to dist/
npm run build

# Run compiled output
npm start
```

---

## :robot: Deployment (Oracle Cloud / Ubuntu)

### First-time Setup

```bash
bash scripts/setup.sh
```

This installs Node.js, PM2, builds the project, registers commands, and starts the bot under PM2 with startup persistence.

### Updating

```bash
bash scripts/deploy.sh
```

Pulls latest changes, rebuilds, and restarts the PM2 process.

### PM2 Commands

```bash
pm2 status              # Check bot status
pm2 logs adhd-bot       # View live logs
pm2 restart adhd-bot    # Manual restart
```

---

## :robot: Code Style & Linting

After installing dependencies, run:

```bash
# Check for lint errors
npm run lint

# Auto-fix where possible
npm run lint:fix
```

---

## :robot: Related

- **[A House Divided](https://github.com/Egg3901/a-house-divided)** — Main game (Next.js / React / MongoDB)
- **[AHD Desktop Client](https://github.com/Egg3901/ahd-client)** — Electron wrapper for native desktop play

---

## :robot: License

Proprietary — All rights reserved.
