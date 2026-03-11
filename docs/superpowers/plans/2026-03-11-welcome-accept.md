# Welcome Embed & /accept Command Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Post a welcome embed to a channel when new members join and add a `/accept` command that assigns the member role.

**Architecture:** A new `src/commands/accept.ts` follows the existing command pattern. The `guildMemberAdd` event handler is added inline in `src/index.ts` alongside the existing `interactionCreate` handler. The `GuildMembers` privileged intent is added to the client. `/accept` is added to `src/register.ts`.

**Tech Stack:** TypeScript, discord.js 14, Node.js ESM (`"type": "module"`)

---

## Chunk 1: /accept Command + guildMemberAdd + Registration

### Task 1: Create `/accept` command

**Files:**
- Create: `src/commands/accept.ts`

- [ ] **Step 1: Create `src/commands/accept.ts`**

```ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";

const MEMBER_ROLE_ID = "1470502115716894846";

export const data = new SlashCommandBuilder()
  .setName("accept")
  .setDescription("Accept the server rules and gain access");

export async function execute(interaction: ChatInputCommandInteraction) {
  const member = interaction.guild?.members.cache.get(interaction.user.id)
    ?? await interaction.guild?.members.fetch(interaction.user.id);

  if (!member) {
    await interaction.reply({ content: "Could not find your server profile. Try again.", ephemeral: true });
    return;
  }

  if (member.roles.cache.has(MEMBER_ROLE_ID)) {
    await interaction.reply({ content: "You already have access.", ephemeral: true });
    return;
  }

  try {
    await member.roles.add(MEMBER_ROLE_ID);
    await interaction.reply({ content: "✅ Welcome! You now have access to the server.", ephemeral: true });
  } catch (error) {
    console.error("Accept role error:", error);
    await interaction.reply({ content: "Could not assign your role. Please contact an admin.", ephemeral: true });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: exit 0, no errors

- [ ] **Step 3: Commit**

```bash
git add src/commands/accept.ts
git commit -m "feat: add /accept command to assign member role"
```

---

### Task 2: Add `GuildMembers` intent and `guildMemberAdd` handler to `index.ts`

**Files:**
- Modify: `src/index.ts`

Read the current file first, then apply these two changes:

**Change 1 — add `GuildMembers` to the intents array:**

Old:
```ts
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});
```

New:
```ts
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});
```

**Change 2 — add the `guildMemberAdd` handler and constants after the `ready` handler.**

Add these constants near the top of the file, right after `validateEnv();`:

```ts
const WELCOME_CHANNEL_ID = "1470572208127475875";
const RULES_CHANNEL_ID = "1474142953437135142";
```

- [ ] **Step 1: Read `src/index.ts`**

Read the file to see the current imports and structure before editing.

- [ ] **Step 2: Add `EmbedBuilder` and `acceptCommand` import to `src/index.ts`**

Also add the accept command import and registration alongside the other commands (Step 6 below covers registering it in the collection).

Add `EmbedBuilder` to the existing discord.js import:

The import line currently looks like:
```ts
import { Client, GatewayIntentBits, Collection } from "discord.js";
```

Update it to:
```ts
import { Client, GatewayIntentBits, Collection, EmbedBuilder } from "discord.js";
```

And add the accept command import alongside the other command imports:
```ts
import * as acceptCommand from "./commands/accept.js";
```

- [ ] **Step 3: Add constants after `validateEnv()`**

After the `validateEnv();` line, add:
```ts
const WELCOME_CHANNEL_ID = "1470572208127475875";
const RULES_CHANNEL_ID = "1474142953437135142";
```

- [ ] **Step 4: Add `GuildMembers` to the intents**

Change:
```ts
  intents: [GatewayIntentBits.Guilds],
```
To:
```ts
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
```

- [ ] **Step 5: Add the `guildMemberAdd` handler after the `ready` handler**

```ts
client.on("guildMemberAdd", async (member) => {
  try {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle("Welcome to the server!")
      .setDescription(
        `Hey ${member}! 👋\n\nWelcome to **${member.guild.name}**.\n\nPlease read the rules in <#${RULES_CHANNEL_ID}>, then run \`/accept\` in this channel to gain access to the rest of the server.`
      )
      .setColor(0x5865f2)
      .setThumbnail(member.user.displayAvatarURL());

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("guildMemberAdd error:", error);
  }
});
```

- [ ] **Step 6: Add `/accept` to the commands collection in `src/index.ts`**

In the collection setup (after the other `commands.set(...)` lines), add:
```ts
commands.set(acceptCommand.data.name, acceptCommand);
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npm run build`
Expected: exit 0, no errors

- [ ] **Step 8: Commit**

```bash
git add src/index.ts
git commit -m "feat: add guildMemberAdd welcome embed and GuildMembers intent"
```

---

### Task 3: Register `/accept` with Discord API

**Files:**
- Modify: `src/register.ts`

- [ ] **Step 1: Read `src/register.ts`**

- [ ] **Step 2: Add the accept command import and registration**

Add to the imports:
```ts
import * as acceptCommand from "./commands/accept.js";
```

Add to the commands array:
```ts
  acceptCommand.data.toJSON(),
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run build`
Expected: exit 0, no errors

- [ ] **Step 4: Commit**

```bash
git add src/register.ts
git commit -m "feat: register /accept command with Discord API"
```

- [ ] **Step 5: Run `npm run register` to push commands to Discord**

Run: `npm run register`
Expected: "Successfully registered commands."

> Requires a valid `.env` with `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID`.

---

## Post-Implementation Notes

- **Privileged intent:** `GuildMembers` must be enabled in the Discord Developer Portal under your application → Bot → Privileged Gateway Intents → Server Members Intent. Without this, `guildMemberAdd` will never fire.
- **Bot permissions:** The bot needs `Manage Roles` permission. Its role in the server must be positioned **above** role `1470502115716894846` in the role hierarchy (Server Settings → Roles).
- **Channel permissions:** The bot needs `Send Messages` and `Embed Links` permissions in channel `1470572208127475875`.
