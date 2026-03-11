# Basic Test Coverage Design
**Date:** 2026-03-11

## Overview

Add unit tests covering all pure utility and formatting functions in the bot. No mocking of discord.js or the game API is needed — every function under test is a pure input/output function.

## Framework

**Vitest** — native ESM and TypeScript support via Vite's bundler, zero configuration overhead, fast. Runs independently of `tsc` using its own esbuild-based transpilation.

## Functions Under Test

| Function | File | Already exported? |
|----------|------|-------------------|
| `hexToInt` | `src/utils/helpers.ts` | Yes |
| `errorMessage` | `src/utils/helpers.ts` | Yes |
| `getMetricValue` | `src/commands/leaderboard.ts` | No — add `export` |
| `ideologyLabel` | `src/commands/party.ts` | No — add `export` |
| `formatElectionType` | `src/commands/elections.ts` | No — add `export` |
| `formatOfficeType` | `src/commands/state.ts` | No — add `export` |

## Test Files

```
tests/
  utils/
    helpers.test.ts       # hexToInt (3), errorMessage (5)
  commands/
    leaderboard.test.ts   # getMetricValue (2)
    party.test.ts         # ideologyLabel (9 — all quadrant combinations)
    elections.test.ts     # formatElectionType (6 known + 1 passthrough)
    state.test.ts         # formatOfficeType (6 known + 1 passthrough)
```

**Total: 33 tests across 5 files**

## Configuration

- `vitest.config.ts` at project root — sets `include: ["tests/**/*.test.ts"]`
- `package.json` — adds `"test": "vitest run"` and `"test:watch": "vitest"` scripts
- `tsconfig.json` — **not modified** (`rootDir: "src"` would conflict with including `tests/`)

## ESM Convention

All test imports use `.js` extensions (e.g. `from "../../src/utils/helpers.js"`). Vitest's Vite-based resolver maps `.js` → `.ts` automatically.
