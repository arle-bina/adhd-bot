# Basic Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 33 unit tests covering all pure utility and formatting functions using Vitest, with zero mocking required.

**Architecture:** Vitest runs TypeScript test files directly from `tests/` using its own esbuild-based transpilation — independent of `tsc`. Five private formatting/utility functions across four command files are exported so they can be imported in tests. All tests are pure function in/out assertions — no discord.js or API mocking needed.

**Tech Stack:** TypeScript, Vitest (ESM-native test runner), Node.js ESM (`"type": "module"`)

**ESM import convention:** All imports in test files must use `.js` extensions (e.g. `from "../../src/utils/helpers.js"`), matching the project's ESM TypeScript convention. Vitest's Vite-based resolver maps `.js` → `.ts` automatically.

---

## Chunk 1: Infrastructure + All Tests

### Task 1: Install Vitest and configure scripts

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

> **Do NOT modify `tsconfig.json`.** The existing config has `"rootDir": "src"` and `"outDir": "dist"` — adding `tests/` to `include` would break `tsc`. Vitest uses its own transpilation pipeline and does not need `tsconfig.json` to include test files.

- [ ] **Step 1: Install Vitest as a dev dependency**

Run: `npm install --save-dev vitest`
Expected: `vitest` appears in `devDependencies` in `package.json`, exit 0

- [ ] **Step 2: Add test scripts to `package.json`**

In the `"scripts"` object, add two entries:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Full scripts section after the change:
```json
"scripts": {
  "start": "node dist/index.js",
  "build": "tsc",
  "dev": "tsx watch src/index.ts",
  "register": "tsx src/register.ts",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

This makes test discovery explicit and ensures Vitest's Vite resolver handles `.js` → `.ts` aliasing for the project's ESM imports.

- [ ] **Step 4: Verify Vitest is reachable**

Run: `npm test`
Expected: output contains "No test files found" or similar — confirms the script and config work. A non-zero exit at this stage is fine.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: install Vitest and add test scripts"
```

---

### Task 2: Tests for `helpers.ts` (`hexToInt`, `errorMessage`)

**Files:**
- Create: `tests/utils/helpers.test.ts`

Both functions are already exported from `src/utils/helpers.ts` — no source changes needed. There is no "red" step for this task; the tests should pass immediately.

- [ ] **Step 1: Create `tests/utils/helpers.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { hexToInt, errorMessage } from "../../src/utils/helpers.js";

describe("hexToInt", () => {
  it("converts hex string with # prefix to integer", () => {
    expect(hexToInt("#ffffff")).toBe(16777215);
  });

  it("converts hex string without # prefix to integer", () => {
    expect(hexToInt("ffffff")).toBe(16777215);
  });

  it("handles a non-white colour", () => {
    expect(hexToInt("#ff0000")).toBe(16711680);
  });
});

describe("errorMessage", () => {
  it("maps 401 error to bot configuration message", () => {
    expect(errorMessage(new Error("API error: 401"))).toBe(
      "Bot configuration error — contact an admin."
    );
  });

  it("maps 400 error to invalid request message", () => {
    expect(errorMessage(new Error("API error: 400"))).toBe(
      "Invalid request — check your inputs."
    );
  });

  it("maps other API errors to something went wrong", () => {
    expect(errorMessage(new Error("API error: 500"))).toBe(
      "Something went wrong. Try again shortly."
    );
  });

  it("maps unrecognised Error to server unreachable", () => {
    expect(errorMessage(new Error("fetch failed"))).toBe(
      "Could not reach the game server. Try again shortly."
    );
  });

  it("handles a non-Error thrown value", () => {
    expect(errorMessage("oops")).toBe(
      "Could not reach the game server. Try again shortly."
    );
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm test tests/utils/helpers.test.ts`
Expected: 8 tests pass, 0 fail

- [ ] **Step 3: Commit**

```bash
git add tests/utils/helpers.test.ts
git commit -m "test: add unit tests for hexToInt and errorMessage"
```

---

### Task 3: Export `getMetricValue` from `leaderboard.ts` and test it

**Files:**
- Modify: `src/commands/leaderboard.ts`
- Create: `tests/commands/leaderboard.test.ts`

`getMetricValue` takes a `LeaderboardCharacter` object. Because TypeScript uses structural typing, the test can pass a plain object literal that satisfies the interface — no import of the interface is strictly necessary, but importing the type gives better editor support.

- [ ] **Step 1: Create `tests/commands/leaderboard.test.ts`**

This will fail to import `getMetricValue` until the next step adds the export.

```ts
import { describe, it, expect } from "vitest";
import { getMetricValue } from "../../src/commands/leaderboard.js";
import type { LeaderboardCharacter } from "../../src/utils/api.js";

const char: LeaderboardCharacter = {
  rank: 1,
  id: "test-id",
  name: "Test Politician",
  party: "Test Party",
  partyColor: "#ffffff",
  stateCode: "CA",
  position: "Senator",
  politicalInfluence: 1500,
  favorability: 75,
  profileUrl: "https://example.com",
};

describe("getMetricValue", () => {
  it("returns favorability when metric is favorability", () => {
    expect(getMetricValue(char, "favorability")).toBe(75);
  });

  it("returns politicalInfluence when metric is politicalInfluence", () => {
    expect(getMetricValue(char, "politicalInfluence")).toBe(1500);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm test tests/commands/leaderboard.test.ts`
Expected: FAIL — `getMetricValue` is not a named export

- [ ] **Step 3: Export `getMetricValue` from `src/commands/leaderboard.ts`**

Change:
```ts
// Explicit conditional avoids TypeScript's TS7053 "any" error from dynamic key indexing (char[metric]).
function getMetricValue(
```
To:
```ts
// Explicit conditional avoids TypeScript's TS7053 "any" error from dynamic key indexing (char[metric]).
export function getMetricValue(
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npm test tests/commands/leaderboard.test.ts`
Expected: 2 tests pass, 0 fail

- [ ] **Step 5: Commit**

```bash
git add src/commands/leaderboard.ts tests/commands/leaderboard.test.ts
git commit -m "test: add unit tests for getMetricValue"
```

---

### Task 4: Export `ideologyLabel` from `party.ts` and test it

**Files:**
- Modify: `src/commands/party.ts`
- Create: `tests/commands/party.test.ts`

`ideologyLabel` maps an `(economic, social)` position pair to a compass label. The thresholds are `< -20` (Left/Liberal) and `> 20` (Right/Conservative); values in `[-20, 20]` are Centre. All 9 quadrant combinations are covered.

- [ ] **Step 1: Create `tests/commands/party.test.ts`**

This will fail to import `ideologyLabel` until the next step adds the export.

```ts
import { describe, it, expect } from "vitest";
import { ideologyLabel } from "../../src/commands/party.js";

describe("ideologyLabel", () => {
  it("returns Centrist for center economic and center social", () => {
    expect(ideologyLabel(0, 0)).toBe("Centrist");
  });

  it("returns Left-Liberal for far left economic and liberal social", () => {
    expect(ideologyLabel(-50, -50)).toBe("Left-Liberal");
  });

  it("returns Right-Conservative for far right economic and conservative social", () => {
    expect(ideologyLabel(50, 50)).toBe("Right-Conservative");
  });

  it("returns Left-Conservative for far left economic and conservative social", () => {
    expect(ideologyLabel(-50, 50)).toBe("Left-Conservative");
  });

  it("returns Right-Liberal for far right economic and liberal social", () => {
    expect(ideologyLabel(50, -50)).toBe("Right-Liberal");
  });

  it("returns Left when only economic position is left", () => {
    expect(ideologyLabel(-50, 0)).toBe("Left");
  });

  it("returns Right when only economic position is right", () => {
    expect(ideologyLabel(50, 0)).toBe("Right");
  });

  it("returns Liberal when only social position is liberal", () => {
    expect(ideologyLabel(0, -50)).toBe("Liberal");
  });

  it("returns Conservative when only social position is conservative", () => {
    expect(ideologyLabel(0, 50)).toBe("Conservative");
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm test tests/commands/party.test.ts`
Expected: FAIL — `ideologyLabel` is not a named export

- [ ] **Step 3: Export `ideologyLabel` from `src/commands/party.ts`**

Change:
```ts
function ideologyLabel(economic: number, social: number): string {
```
To:
```ts
export function ideologyLabel(economic: number, social: number): string {
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npm test tests/commands/party.test.ts`
Expected: 9 tests pass, 0 fail

- [ ] **Step 5: Commit**

```bash
git add src/commands/party.ts tests/commands/party.test.ts
git commit -m "test: add unit tests for ideologyLabel"
```

---

### Task 5: Export `formatElectionType` from `elections.ts` and test it

**Files:**
- Modify: `src/commands/elections.ts`
- Create: `tests/commands/elections.test.ts`

- [ ] **Step 1: Create `tests/commands/elections.test.ts`**

This will fail to import `formatElectionType` until the next step adds the export.

```ts
import { describe, it, expect } from "vitest";
import { formatElectionType } from "../../src/commands/elections.js";

describe("formatElectionType", () => {
  it.each([
    ["senate", "Senate"],
    ["house", "House"],
    ["governor", "Governor"],
    ["president", "Presidential"],
    ["commons", "Commons"],
    ["primeMinister", "Prime Minister"],
  ])("maps '%s' to '%s'", (input, expected) => {
    expect(formatElectionType(input)).toBe(expected);
  });

  it("passes through unknown types unchanged", () => {
    expect(formatElectionType("unknown_type")).toBe("unknown_type");
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm test tests/commands/elections.test.ts`
Expected: FAIL — `formatElectionType` is not a named export

- [ ] **Step 3: Export `formatElectionType` from `src/commands/elections.ts`**

Change:
```ts
function formatElectionType(type: string): string {
```
To:
```ts
export function formatElectionType(type: string): string {
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npm test tests/commands/elections.test.ts`
Expected: 7 tests pass, 0 fail

- [ ] **Step 5: Commit**

```bash
git add src/commands/elections.ts tests/commands/elections.test.ts
git commit -m "test: add unit tests for formatElectionType"
```

---

### Task 6: Export `formatOfficeType` from `state.ts` and test it

**Files:**
- Modify: `src/commands/state.ts`
- Create: `tests/commands/state.test.ts`

- [ ] **Step 1: Create `tests/commands/state.test.ts`**

This will fail to import `formatOfficeType` until the next step adds the export.

```ts
import { describe, it, expect } from "vitest";
import { formatOfficeType } from "../../src/commands/state.js";

describe("formatOfficeType", () => {
  it.each([
    ["governor", "Governor"],
    ["senate", "Senator"],
    ["house", "Representative"],
    ["stateSenate", "State Senator"],
    ["commons", "MP"],
    ["primeMinister", "Prime Minister"],
  ])("maps '%s' to '%s'", (input, expected) => {
    expect(formatOfficeType(input)).toBe(expected);
  });

  it("passes through unknown types unchanged", () => {
    expect(formatOfficeType("unknown_type")).toBe("unknown_type");
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm test tests/commands/state.test.ts`
Expected: FAIL — `formatOfficeType` is not a named export

- [ ] **Step 3: Export `formatOfficeType` from `src/commands/state.ts`**

Change:
```ts
function formatOfficeType(type: string): string {
```
To:
```ts
export function formatOfficeType(type: string): string {
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npm test tests/commands/state.test.ts`
Expected: 7 tests pass, 0 fail

- [ ] **Step 5: Commit**

```bash
git add src/commands/state.ts tests/commands/state.test.ts
git commit -m "test: add unit tests for formatOfficeType"
```

---

### Task 7: Run full test suite and verify build

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: 33 tests pass across 5 test files, 0 fail

- [ ] **Step 2: Verify TypeScript still compiles**

Run: `npm run build`
Expected: exit 0, no errors (tsconfig was not modified, so `dist/` output is unchanged)
