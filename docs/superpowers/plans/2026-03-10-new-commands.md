# New Slash Commands Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five slash commands (`/leaderboard`, `/party`, `/elections`, `/state`, `/news`) to the A House Divided Discord bot.

**Architecture:** Each command lives in its own file under `src/commands/`, exports `data` (SlashCommandBuilder) and `execute` (async handler), and calls a typed API function from `src/utils/api.ts`. `src/utils/helpers.ts` exports `hexToInt` (used by `/party` for its API-driven embed color) and `errorMessage` (used by all 5 commands). Commands use direct `interaction.reply()` — no `deferReply()` — so success replies are public and error/not-found replies can be `ephemeral: true`. The catch block safely handles the rare case where a reply was already sent. `index.ts` and `register.ts` are updated to wire everything in.

**Tech Stack:** TypeScript, discord.js 14, dotenv, Node.js ESM (`"type": "module"`)

---

## Chunk 1: Shared Utilities

### Task 1: Create `helpers.ts` with shared utilities

**Files:**
- Create: `src/utils/helpers.ts`

- [ ] **Step 1: Create `src/utils/helpers.ts`**

```ts
export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export function errorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : "";
  if (msg.includes("401")) return "Bot configuration error — contact an admin.";
  if (msg.includes("400")) return "Invalid request — check your inputs.";
  if (msg.includes("API error")) return "Something went wrong. Try again shortly.";
  return "Could not reach the game server. Try again shortly.";
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: exit 0, no errors

- [ ] **Step 3: Commit**

```bash
git add src/utils/helpers.ts
git commit -m "feat: add shared helpers (hexToInt, errorMessage)"
```

---

### Task 2: Add leaderboard and party API functions to `api.ts`

**Files:**
- Modify: `src/utils/api.ts`

- [ ] **Step 1: Append types and functions to `src/utils/api.ts`**

Add at the end of the file:

```ts
// --- Leaderboard ---

export interface LeaderboardCharacter {
  rank: number;
  id: string;
  name: string;
  party: string;
  partyColor: string;
  stateCode: string;
  position: string;
  politicalInfluence: number;
  favorability: number;
  profileUrl: string;
}

interface LeaderboardResponse {
  found: boolean;
  metric: "politicalInfluence" | "favorability";
  characters: LeaderboardCharacter[];
}

export async function getLeaderboard(params: {
  metric?: string;
  country?: string;
  limit?: number;
}): Promise<LeaderboardResponse> {
  const url = new URL("/api/discord-bot/leaderboard", process.env.GAME_API_URL);
  if (params.metric) url.searchParams.set("metric", params.metric);
  if (params.country) url.searchParams.set("country", params.country);
  if (params.limit != null) url.searchParams.set("limit", String(params.limit));

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

// --- Party ---

interface PartyTopMember {
  id: string;
  name: string;
  position: string;
  politicalInfluence: number;
  profileUrl: string;
}

interface PartyData {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  economicPosition: number;
  socialPosition: number;
  memberCount: number;
  treasury: number;
  chairName: string | null;
  partyUrl: string;
  topMembers: PartyTopMember[];
}

interface PartyResponse {
  found: boolean;
  party?: PartyData;
}

export async function getParty(id: string): Promise<PartyResponse> {
  const url = new URL("/api/discord-bot/party", process.env.GAME_API_URL);
  url.searchParams.set("id", id);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: exit 0, no errors

- [ ] **Step 3: Commit**

```bash
git add src/utils/api.ts
git commit -m "feat: add leaderboard and party API functions"
```

---

### Task 3: Add elections, state, and news API functions to `api.ts`

**Files:**
- Modify: `src/utils/api.ts`

- [ ] **Step 1: Append types and functions to `src/utils/api.ts`**

```ts
// --- Elections ---

interface ElectionCandidate {
  characterId: string;
  characterName: string;
  party: string;
  partyColor: string;
}

interface Election {
  id: string;
  electionType: string;
  state: string;
  status: "upcoming" | "active";
  startTime: string | null;
  endTime: string | null;
  candidates: ElectionCandidate[];
}

interface ElectionsResponse {
  found: boolean;
  elections: Election[];
}

export async function getElections(params: {
  country?: string;
  state?: string;
}): Promise<ElectionsResponse> {
  const url = new URL("/api/discord-bot/elections", process.env.GAME_API_URL);
  if (params.country) url.searchParams.set("country", params.country);
  if (params.state) url.searchParams.set("state", params.state);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

// --- State ---

interface StateOfficial {
  officeType: string;
  characterId: string | null;
  characterName: string | null;
  party: string | null;
  partyColor: string;
  isNPP: boolean;
}

interface StateData {
  id: string;
  name: string;
  region: string;
  population: number;
  votingSystem: "fptp" | "rcv";
  stateUrl: string;
  officials: StateOfficial[];
}

interface StateResponse {
  found: boolean;
  state?: StateData;
}

export async function getState(id: string): Promise<StateResponse> {
  const url = new URL("/api/discord-bot/state", process.env.GAME_API_URL);
  url.searchParams.set("id", id);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

// --- News ---

interface NewsPost {
  id: string;
  title: string | null;
  content: string;
  authorName: string;
  isSystem: boolean;
  category: "election" | "legislation" | "executive" | "general" | null;
  stateId: string | null;
  reactions: { agree: number; disagree: number };
  createdAt: string;
  postUrl: string;
}

interface NewsResponse {
  found: boolean;
  posts: NewsPost[];
}

export async function getNews(params: {
  category?: string;
  limit?: number;
}): Promise<NewsResponse> {
  const url = new URL("/api/discord-bot/news", process.env.GAME_API_URL);
  if (params.category) url.searchParams.set("category", params.category);
  if (params.limit != null) url.searchParams.set("limit", String(params.limit));

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: exit 0, no errors

- [ ] **Step 3: Commit**

```bash
git add src/utils/api.ts
git commit -m "feat: add elections, state, and news API functions"
```

---

## Chunk 2: /leaderboard and /party Commands

### Task 4: Implement `/leaderboard` command

**Files:**
- Create: `src/commands/leaderboard.ts`

- [ ] **Step 1: Create `src/commands/leaderboard.ts`**

Note: Uses direct `interaction.reply()` — no defer — so errors/not-found are `ephemeral: true` and success embeds are public. `getMetricValue` avoids TS7053 dynamic key indexing. The catch block uses `followUp` as a safe fallback if a reply was already sent somehow.

```ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getLeaderboard, LeaderboardCharacter } from "../utils/api.js";
import { errorMessage } from "../utils/helpers.js";

function getMetricValue(
  char: LeaderboardCharacter,
  metric: "politicalInfluence" | "favorability"
): number {
  return metric === "favorability" ? char.favorability : char.politicalInfluence;
}

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show top politicians by influence or favorability")
  .addStringOption((option) =>
    option
      .setName("metric")
      .setDescription("What to rank by")
      .setRequired(false)
      .addChoices(
        { name: "Political Influence (default)", value: "influence" },
        { name: "Favorability", value: "favorability" }
      )
  )
  .addStringOption((option) =>
    option
      .setName("country")
      .setDescription("Filter by country")
      .setRequired(false)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" }
      )
  )
  .addIntegerOption((option) =>
    option
      .setName("limit")
      .setDescription("Number of results (max 25, default 10)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(25)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const metric = interaction.options.getString("metric") ?? "influence";
  const country = interaction.options.getString("country") ?? undefined;
  const limit = interaction.options.getInteger("limit") ?? 10;

  try {
    const result = await getLeaderboard({ metric, country, limit });

    if (!result.found || result.characters.length === 0) {
      await interaction.reply({ content: "No politicians found.", ephemeral: true });
      return;
    }

    const metricLabel =
      result.metric === "favorability" ? "Favorability" : "Political Influence";

    const lines = result.characters.map((char) => {
      const value = getMetricValue(char, result.metric).toLocaleString();
      return `${char.rank}. **${char.name}** — ${char.position} · ${char.party} · 📊 ${value}`;
    });

    const footerParts = ["ahousedivided.com"];
    if (country) footerParts.push(`Country: ${country}`);

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Top Politicians — ${metricLabel}`)
      .setColor(0x2b2d31)
      .setDescription(lines.join("\n"))
      .setFooter({ text: footerParts.join(" · ") });

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Leaderboard error:", error);
    const errReply = { content: errorMessage(error), ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errReply);
    } else {
      await interaction.reply(errReply);
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: exit 0, no errors

- [ ] **Step 3: Commit**

```bash
git add src/commands/leaderboard.ts
git commit -m "feat: add /leaderboard command"
```

---

### Task 5: Implement `/party` command

**Files:**
- Create: `src/commands/party.ts`

- [ ] **Step 1: Create `src/commands/party.ts`**

```ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getParty } from "../utils/api.js";
import { hexToInt, errorMessage } from "../utils/helpers.js";

function ideologyLabel(economic: number, social: number): string {
  const econ = economic < -20 ? "Left" : economic > 20 ? "Right" : "Center";
  const soc = social < -20 ? "Liberal" : social > 20 ? "Conservative" : "Center";
  if (econ === "Center" && soc === "Center") return "Centrist";
  if (soc === "Center") return econ;
  if (econ === "Center") return soc;
  return `${econ}-${soc}`;
}

export const data = new SlashCommandBuilder()
  .setName("party")
  .setDescription("Look up a political party")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription("Party ID/slug (e.g. democrat, republican, labour)")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString("id", true);

  try {
    const result = await getParty(id);

    if (!result.found || !result.party) {
      await interaction.reply({
        content: "Party not found. Try the slug, e.g. `democrat`, `republican`, `labour`.",
        ephemeral: true,
      });
      return;
    }

    const party = result.party;

    const topMembersValue =
      party.topMembers
        .slice(0, 5)
        .map((m, i) => `${i + 1}. ${m.name} — ${m.position}`)
        .join("\n") || "None";

    const embed = new EmbedBuilder()
      .setTitle(`[${party.abbreviation}] ${party.name}`)
      .setURL(party.partyUrl)
      .setColor(hexToInt(party.color))
      .addFields(
        { name: "Chair", value: party.chairName ?? "Vacant", inline: true },
        { name: "Members", value: party.memberCount.toLocaleString(), inline: true },
        { name: "Treasury", value: `$${party.treasury.toLocaleString()}`, inline: true },
        {
          name: "Ideology",
          value: ideologyLabel(party.economicPosition, party.socialPosition),
          inline: true,
        },
        { name: "Top Members", value: topMembersValue }
      );

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Party error:", error);
    const errReply = { content: errorMessage(error), ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errReply);
    } else {
      await interaction.reply(errReply);
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: exit 0, no errors

- [ ] **Step 3: Commit**

```bash
git add src/commands/party.ts
git commit -m "feat: add /party command"
```

---

## Chunk 3: /elections and /state Commands

### Task 6: Implement `/elections` command

**Files:**
- Create: `src/commands/elections.ts`

- [ ] **Step 1: Create `src/commands/elections.ts`**

```ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getElections } from "../utils/api.js";
import { errorMessage } from "../utils/helpers.js";

function formatElectionType(type: string): string {
  const map: Record<string, string> = {
    senate: "Senate",
    house: "House",
    governor: "Governor",
    president: "Presidential",
    commons: "Commons",
    primeMinister: "Prime Minister",
  };
  return map[type] ?? type;
}

export const data = new SlashCommandBuilder()
  .setName("elections")
  .setDescription("Show active and upcoming elections")
  .addStringOption((option) =>
    option
      .setName("country")
      .setDescription("Filter by country")
      .setRequired(false)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" }
      )
  )
  .addStringOption((option) =>
    option
      .setName("state")
      .setDescription("Filter by state/region code (e.g. CA, TX)")
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const country = interaction.options.getString("country") ?? undefined;
  const state = interaction.options.getString("state") ?? undefined;

  try {
    const result = await getElections({ country, state });

    if (!result.found || result.elections.length === 0) {
      await interaction.reply({
        content: "No active or upcoming elections found.",
        ephemeral: true,
      });
      return;
    }

    const total = result.elections.length;
    const shown = result.elections.slice(0, 5);

    const lines = shown.map((e) => {
      const typeLabel = formatElectionType(e.electionType);
      const candidateList =
        e.candidates.map((c) => `${c.characterName} (${c.party})`).join(", ") ||
        "No candidates yet";
      const timeStr = e.endTime
        ? `<t:${Math.floor(new Date(e.endTime).getTime() / 1000)}:R>`
        : "TBD";
      return `**[${typeLabel}] — ${e.state}** (${e.status})\nCandidates: ${candidateList}\nEnds: ${timeStr}`;
    });

    const embed = new EmbedBuilder()
      .setTitle("🗳️ Active & Upcoming Elections")
      .setColor(0x5865f2)
      .setDescription(lines.join("\n\n"));

    if (total > 5) {
      embed.setFooter({ text: `Showing 5 of ${total} elections` });
    }

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Elections error:", error);
    const errReply = { content: errorMessage(error), ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errReply);
    } else {
      await interaction.reply(errReply);
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: exit 0, no errors

- [ ] **Step 3: Commit**

```bash
git add src/commands/elections.ts
git commit -m "feat: add /elections command"
```

---

### Task 7: Implement `/state` command

**Files:**
- Create: `src/commands/state.ts`

- [ ] **Step 1: Create `src/commands/state.ts`**

```ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getState } from "../utils/api.js";
import { errorMessage } from "../utils/helpers.js";

function formatOfficeType(type: string): string {
  const map: Record<string, string> = {
    governor: "Governor",
    senate: "Senator",
    house: "Representative",
    stateSenate: "State Senator",
    commons: "MP",
    primeMinister: "Prime Minister",
  };
  return map[type] ?? type;
}

export const data = new SlashCommandBuilder()
  .setName("state")
  .setDescription("Look up a state or region")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription("State/region code (e.g. CA, TX, NY, UK_ENG)")
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString("id", true);

  try {
    const result = await getState(id);

    if (!result.found || !result.state) {
      await interaction.reply({
        content: "State not found. Use the state code, e.g. `CA`, `TX`, `UK_ENG`.",
        ephemeral: true,
      });
      return;
    }

    const s = result.state;

    const officialsValue =
      s.officials
        .map((o) => {
          const officeLabel = formatOfficeType(o.officeType);
          const nameStr = o.characterName
            ? `${o.characterName}${o.isNPP ? " [NPC]" : ""} (${o.party ?? "Independent"})`
            : "Vacant";
          return `**${officeLabel}:** ${nameStr}`;
        })
        .join("\n") || "None";

    const embed = new EmbedBuilder()
      .setTitle(`🏛️ ${s.name}`)
      .setURL(s.stateUrl)
      .setColor(0x57f287)
      .addFields(
        { name: "Region", value: s.region, inline: true },
        { name: "Population", value: s.population.toLocaleString(), inline: true },
        {
          name: "Voting System",
          value: s.votingSystem === "rcv" ? "Ranked Choice" : "First Past the Post",
          inline: true,
        },
        { name: "Officials", value: officialsValue.slice(0, 1024) }
      );

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("State error:", error);
    const errReply = { content: errorMessage(error), ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errReply);
    } else {
      await interaction.reply(errReply);
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: exit 0, no errors

- [ ] **Step 3: Commit**

```bash
git add src/commands/state.ts
git commit -m "feat: add /state command"
```

---

## Chunk 4: /news Command + Wiring

### Task 8: Implement `/news` command

**Files:**
- Create: `src/commands/news.ts`

- [ ] **Step 1: Create `src/commands/news.ts`**

Note: Content is truncated before the footer string is appended so the `[Read more](url)` link is never cut.

```ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getNews } from "../utils/api.js";
import { errorMessage } from "../utils/helpers.js";

const categoryNames: Record<string, string> = {
  election: "Elections",
  legislation: "Legislation",
  executive: "Executive",
  general: "General",
};

export const data = new SlashCommandBuilder()
  .setName("news")
  .setDescription("Show the latest in-game news")
  .addStringOption((option) =>
    option
      .setName("category")
      .setDescription("Filter by news category")
      .setRequired(false)
      .addChoices(
        { name: "Elections", value: "election" },
        { name: "Legislation", value: "legislation" },
        { name: "Executive", value: "executive" },
        { name: "General", value: "general" }
      )
  )
  .addIntegerOption((option) =>
    option
      .setName("limit")
      .setDescription("Number of posts to show (max 10, default 5)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(10)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const category = interaction.options.getString("category") ?? undefined;
  const limit = interaction.options.getInteger("limit") ?? 5;

  try {
    const result = await getNews({ category, limit });

    if (!result.found || result.posts.length === 0) {
      await interaction.reply({ content: "No news posts found.", ephemeral: true });
      return;
    }

    const titleSuffix = category ? ` — ${categoryNames[category] ?? category}` : "";
    const embed = new EmbedBuilder()
      .setTitle(`📰 Latest News${titleSuffix}`)
      .setColor(0xfee75c);

    for (const post of result.posts) {
      const fieldName = (
        (post.title ?? post.authorName) + (post.isSystem ? " [SYSTEM]" : "")
      ).slice(0, 256);
      const ts = Math.floor(new Date(post.createdAt).getTime() / 1000);
      const footer = `\n👍 ${post.reactions.agree}  👎 ${post.reactions.disagree}  · <t:${ts}:R>  · [Read more](${post.postUrl})`;
      const maxContentLen = 1024 - footer.length;
      const content =
        post.content.length > maxContentLen
          ? post.content.slice(0, maxContentLen - 1) + "…"
          : post.content;
      embed.addFields({ name: fieldName, value: content + footer });
    }

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("News error:", error);
    const errReply = { content: errorMessage(error), ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errReply);
    } else {
      await interaction.reply(errReply);
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: exit 0, no errors

- [ ] **Step 3: Commit**

```bash
git add src/commands/news.ts
git commit -m "feat: add /news command"
```

---

### Task 9: Wire all commands into `index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace `src/index.ts` with the updated version**

```ts
import { Client, GatewayIntentBits, Collection } from "discord.js";
import { validateEnv } from "./utils/env.js";
import * as profileCommand from "./commands/profile.js";
import * as leaderboardCommand from "./commands/leaderboard.js";
import * as partyCommand from "./commands/party.js";
import * as electionsCommand from "./commands/elections.js";
import * as stateCommand from "./commands/state.js";
import * as newsCommand from "./commands/news.js";

validateEnv();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = new Collection<string, typeof profileCommand>();
commands.set(profileCommand.data.name, profileCommand);
commands.set(leaderboardCommand.data.name, leaderboardCommand);
commands.set(partyCommand.data.name, partyCommand);
commands.set(electionsCommand.data.name, electionsCommand);
commands.set(stateCommand.data.name, stateCommand);
commands.set(newsCommand.data.name, newsCommand);

client.once("ready", () => {
  console.log(`Bot ready as ${client.user?.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error("Command error:", error);
    const reply = {
      content: "There was an error executing this command.",
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: exit 0, no errors

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: register all new commands in index.ts"
```

---

### Task 10: Wire all commands into `register.ts`

**Files:**
- Modify: `src/register.ts`

- [ ] **Step 1: Replace `src/register.ts` with the updated version**

```ts
import { REST, Routes } from "discord.js";
import { validateEnv } from "./utils/env.js";
import * as profileCommand from "./commands/profile.js";
import * as leaderboardCommand from "./commands/leaderboard.js";
import * as partyCommand from "./commands/party.js";
import * as electionsCommand from "./commands/elections.js";
import * as stateCommand from "./commands/state.js";
import * as newsCommand from "./commands/news.js";

validateEnv();

const commands = [
  profileCommand.data.toJSON(),
  leaderboardCommand.data.toJSON(),
  partyCommand.data.toJSON(),
  electionsCommand.data.toJSON(),
  stateCommand.data.toJSON(),
  newsCommand.data.toJSON(),
];

const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN!);

async function main() {
  try {
    console.log("Registering slash commands...");

    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!), {
      body: commands,
    });

    console.log("Successfully registered commands.");
  } catch (error) {
    console.error(error);
  }
}

main();
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: exit 0, no errors

- [ ] **Step 3: Commit**

```bash
git add src/register.ts
git commit -m "feat: register all new commands with Discord API"
```

- [ ] **Step 4: Run `npm run register` to push commands to Discord**

Run: `npm run register`
Expected: "Successfully registered commands."

> Note: Requires a valid `.env` with `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID`. Run from a machine that has the environment configured.
