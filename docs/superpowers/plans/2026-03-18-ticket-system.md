# Ticket System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a support ticket system where users open private channels via `/ticket` or a reaction panel, categorized as bug/suggestion/moderation, with transcript logging on close.

**Architecture:** JSON-backed store (mirrors `starboardStore.ts` pattern) tracks open tickets, panel messages, and per-guild counters. Core logic lives in `src/utils/tickets.ts`; three thin command files orchestrate user-facing interactions. `index.ts` gets a button handler branch and panel/close reaction hooks.

**Tech Stack:** discord.js v14, TypeScript 5.3, JSON file persistence in `data/`

**Spec:** `docs/superpowers/specs/2026-03-18-ticket-system-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/utils/ticketStore.ts` | Create | JSON persistence: tickets, panels, counters, category IDs |
| `src/utils/tickets.ts` | Create | Core logic: createTicket, closeTicket, handlePanelReaction, handleLockReaction |
| `src/commands/ticket.ts` | Create | `/ticket` slash command — select menu → create ticket |
| `src/commands/ticket-panel.ts` | Create | `/ticket-panel` admin command — post reaction panel |
| `src/commands/close-ticket.ts` | Create | `/close-ticket` command — close from within ticket channel |
| `src/index.ts` | Modify | Button handler, reaction hooks, presence update |
| `.env.example` | Modify | Add `DEV_TEAM_ROLE_ID`, `TICKET_LOG_CHANNEL_ID` |

---

### Task 1: Ticket Store (`ticketStore.ts`)

**Files:**
- Create: `src/utils/ticketStore.ts`

- [ ] **Step 1: Create the ticket store**

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, "..", "..", "data");
const TICKET_FILE = join(DATA_DIR, "tickets.json");

export type TicketCategory = "bug" | "suggestion" | "moderation";

export interface Ticket {
  userId: string;
  category: TicketCategory;
  channelId: string;
  createdAt: string;
  ticketNumber: number;
}

interface TicketData {
  tickets: Record<string, Record<string, Ticket>>;
  panels: Record<string, Record<string, string>>;
  categoryIds: Record<string, string>;
  counters: Record<string, number>;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadData(): TicketData {
  ensureDataDir();
  if (!existsSync(TICKET_FILE)) {
    return { tickets: {}, panels: {}, categoryIds: {}, counters: {} };
  }
  try {
    const raw = readFileSync(TICKET_FILE, "utf-8");
    return JSON.parse(raw) as TicketData;
  } catch {
    return { tickets: {}, panels: {}, categoryIds: {}, counters: {} };
  }
}

function saveData(data: TicketData): void {
  ensureDataDir();
  writeFileSync(TICKET_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function getTickets(guildId: string): Record<string, Ticket> {
  const data = loadData();
  return data.tickets[guildId] ?? {};
}

export function addTicket(guildId: string, ticket: Ticket): void {
  const data = loadData();
  if (!data.tickets[guildId]) data.tickets[guildId] = {};
  data.tickets[guildId][ticket.channelId] = ticket;
  saveData(data);
}

export function removeTicket(guildId: string, channelId: string): void {
  const data = loadData();
  if (data.tickets[guildId]) {
    delete data.tickets[guildId][channelId];
    saveData(data);
  }
}

export function getTicketByChannel(guildId: string, channelId: string): Ticket | undefined {
  const data = loadData();
  return data.tickets[guildId]?.[channelId];
}

export function getNextTicketNumber(guildId: string): number {
  const data = loadData();
  const next = (data.counters[guildId] ?? 0) + 1;
  data.counters[guildId] = next;
  saveData(data);
  return next;
}

export function findOpenTicket(guildId: string, userId: string, category: TicketCategory): Ticket | undefined {
  const tickets = getTickets(guildId);
  return Object.values(tickets).find((t) => t.userId === userId && t.category === category);
}

export function addPanel(guildId: string, messageId: string, panelChannelId: string): void {
  const data = loadData();
  if (!data.panels[guildId]) data.panels[guildId] = {};
  data.panels[guildId][messageId] = panelChannelId;
  saveData(data);
}

export function isPanel(guildId: string, messageId: string): boolean {
  const data = loadData();
  return !!data.panels[guildId]?.[messageId];
}

export function getCategoryId(guildId: string): string | undefined {
  const data = loadData();
  return data.categoryIds[guildId];
}

export function setCategoryId(guildId: string, categoryId: string): void {
  const data = loadData();
  data.categoryIds[guildId] = categoryId;
  saveData(data);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors from `ticketStore.ts`

- [ ] **Step 3: Commit**

```bash
git add src/utils/ticketStore.ts
git commit -m "feat(tickets): add ticket data store with JSON persistence"
```

---

### Task 2: Core Ticket Logic (`tickets.ts`)

**Files:**
- Create: `src/utils/tickets.ts`

- [ ] **Step 1: Create the core tickets utility**

```typescript
import {
  Guild,
  GuildMember,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  TextChannel,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import {
  type TicketCategory,
  addTicket,
  removeTicket,
  getTicketByChannel,
  findOpenTicket,
  getNextTicketNumber,
  getCategoryId,
  setCategoryId,
} from "./ticketStore.js";

const CATEGORY_CONFIG: Record<TicketCategory, { label: string; emoji: string; color: number }> = {
  bug: { label: "Bug Report", emoji: "🐛", color: 0xed4245 },
  suggestion: { label: "Suggestion", emoji: "💡", color: 0x57f287 },
  moderation: { label: "Moderation Issue", emoji: "🛡️", color: 0xfee75c },
};

export const PANEL_EMOJI_MAP: Record<string, TicketCategory> = {
  "🐛": "bug",
  "💡": "suggestion",
  "🛡️": "moderation",
};

// In-memory lock to prevent race conditions on double-click
const creationLocks = new Set<string>();

function sanitizeUsername(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 15);
}

async function getOrCreateCategory(guild: Guild): Promise<string> {
  const storedId = getCategoryId(guild.id);
  if (storedId) {
    const existing = guild.channels.cache.get(storedId);
    if (existing) return storedId;
  }

  // Search for existing "Tickets" category
  const found = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === "Tickets",
  );
  if (found) {
    setCategoryId(guild.id, found.id);
    return found.id;
  }

  // Create new category
  const created = await guild.channels.create({
    name: "Tickets",
    type: ChannelType.GuildCategory,
    reason: "AHD Bot — ticket system category",
  });
  setCategoryId(guild.id, created.id);
  return created.id;
}

export async function createTicket(
  guild: Guild,
  userId: string,
  username: string,
  category: TicketCategory,
): Promise<{ success: true; channelId: string } | { success: false; reason: string; existingChannelId?: string }> {
  const lockKey = `${guild.id}:${userId}:${category}`;
  if (creationLocks.has(lockKey)) {
    return { success: false, reason: "Your ticket is already being created. Please wait." };
  }

  creationLocks.add(lockKey);
  try {
    // Check bot permissions
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return { success: false, reason: "I need the **Manage Channels** permission to create tickets." };
    }

    // One-per-category check (with stale cleanup)
    const existing = findOpenTicket(guild.id, userId, category);
    if (existing) {
      const channelStillExists = guild.channels.cache.has(existing.channelId);
      if (channelStillExists) {
        return {
          success: false,
          reason: `You already have an open ${category} ticket: <#${existing.channelId}>`,
          existingChannelId: existing.channelId,
        };
      }
      // Stale — clean up
      removeTicket(guild.id, existing.channelId);
    }

    const categoryId = await getOrCreateCategory(guild);
    const ticketNumber = getNextTicketNumber(guild.id);
    const paddedNum = String(ticketNumber).padStart(4, "0");
    const channelName = `ticket-${category}-${sanitizeUsername(username)}-${paddedNum}`;

    const devTeamRoleId = process.env.DEV_TEAM_ROLE_ID;

    const permissionOverwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: userId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: guild.members.me!.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
        ],
      },
      ...(devTeamRoleId
        ? [
            {
              id: devTeamRoleId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ]
        : []),
    ];

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites,
      reason: `AHD Bot — ticket #${paddedNum} (${category})`,
    });

    const config = CATEGORY_CONFIG[category];

    const embed = new EmbedBuilder()
      .setTitle(`${config.emoji} ${config.label} — #${paddedNum}`)
      .setColor(config.color)
      .addFields(
        { name: "Opened by", value: `<@${userId}>`, inline: true },
        { name: "Category", value: config.label, inline: true },
        { name: "Created", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: "ahousedividedgame.com" })
      .setTimestamp();

    const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Close Ticket")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒"),
    );

    await channel.send({ embeds: [embed], components: [closeRow] });

    if (devTeamRoleId) {
      await channel.send(`<@&${devTeamRoleId}>`).catch(() => {});
    }

    addTicket(guild.id, {
      userId,
      category,
      channelId: channel.id,
      createdAt: new Date().toISOString(),
      ticketNumber,
    });

    return { success: true, channelId: channel.id };
  } finally {
    creationLocks.delete(lockKey);
  }
}

async function fetchAllMessages(channel: TextChannel, cap: number): Promise<Message[]> {
  const all: Message[] = [];
  let lastId: string | undefined;

  while (all.length < cap) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(lastId ? { before: lastId } : {}),
    });
    if (batch.size === 0) break;
    all.push(...batch.values());
    lastId = batch.last()!.id;
    if (batch.size < 100) break;
  }

  return all.slice(0, cap).reverse(); // chronological order
}

function buildTranscriptText(
  ticket: { ticketNumber: number; category: TicketCategory; userId: string; createdAt: string },
  closerId: string,
  messages: Message[],
): string {
  const config = CATEGORY_CONFIG[ticket.category];
  const lines: string[] = [
    `Ticket #${String(ticket.ticketNumber).padStart(4, "0")} — ${config.label}`,
    `Opened by: ${ticket.userId}`,
    `Closed by: ${closerId}`,
    `Created: ${ticket.createdAt}`,
    `Closed: ${new Date().toISOString()}`,
    `Messages: ${messages.length}`,
    "---",
  ];

  for (const msg of messages) {
    const ts = msg.createdAt.toISOString().slice(0, 19).replace("T", " ");
    const author = `${msg.author.displayName} (${msg.author.id})`;
    const content = msg.content || "[embed/attachment]";
    lines.push(`[${ts}] ${author}: ${content}`);
  }

  return lines.join("\n");
}

export async function closeTicket(
  channel: TextChannel,
  closer: GuildMember,
  interaction?: ButtonInteraction | ChatInputCommandInteraction,
): Promise<void> {
  const guild = channel.guild;
  const ticket = getTicketByChannel(guild.id, channel.id);

  if (!ticket) {
    const msg = "This channel is not a ticket.";
    if (interaction) {
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content: msg, ephemeral: true });
      else await interaction.reply({ content: msg, ephemeral: true });
    } else {
      await channel.send(msg).catch(() => {});
    }
    return;
  }

  // Permission check
  const isCreator = closer.id === ticket.userId;
  const isMod = closer.permissions.has(PermissionFlagsBits.ManageChannels);
  if (!isCreator && !isMod) {
    const msg = "You don't have permission to close this ticket.";
    if (interaction) {
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content: msg, ephemeral: true });
      else await interaction.reply({ content: msg, ephemeral: true });
    } else {
      await channel.send(msg).catch(() => {});
    }
    return;
  }

  // Confirmation
  const confirmEmbed = new EmbedBuilder()
    .setTitle("Close Ticket?")
    .setDescription("Are you sure you want to close this ticket? A transcript will be saved.")
    .setColor(0xed4245);

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close_confirm")
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("ticket_close_cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  let confirmMsg: Message;
  if (interaction) {
    if (interaction.replied || interaction.deferred) {
      confirmMsg = await interaction.followUp({ embeds: [confirmEmbed], components: [confirmRow] }) as Message;
    } else {
      await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow] });
      confirmMsg = await interaction.fetchReply() as Message;
    }
  } else {
    confirmMsg = await channel.send({ embeds: [confirmEmbed], components: [confirmRow] });
  }

  const collector = confirmMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (btn) => btn.user.id === closer.id,
    time: 30_000,
    max: 1,
  });

  collector.on("collect", async (btn) => {
    if (btn.customId === "ticket_close_cancel") {
      const cancelledEmbed = new EmbedBuilder()
        .setTitle("Close Ticket?")
        .setDescription("Close cancelled.")
        .setColor(0x5865f2);
      await btn.update({ embeds: [cancelledEmbed], components: [] });
      return;
    }

    // ticket_close_confirm
    const closingEmbed = new EmbedBuilder()
      .setTitle("Close Ticket?")
      .setDescription("Closing ticket...")
      .setColor(0x95a5a6);
    await btn.update({ embeds: [closingEmbed], components: [] });

    const messages = await fetchAllMessages(channel, 500);
    const transcript = buildTranscriptText(ticket, closer.id, messages);
    const truncated = messages.length >= 500;

    const config = CATEGORY_CONFIG[ticket.category];
    const paddedNum = String(ticket.ticketNumber).padStart(4, "0");
    const created = new Date(ticket.createdAt);
    const duration = Math.floor((Date.now() - created.getTime()) / 60000);
    const durationStr = duration < 60 ? `${duration}m` : `${Math.floor(duration / 60)}h ${duration % 60}m`;

    const logEmbed = new EmbedBuilder()
      .setTitle(`🎫 Ticket Closed — #${paddedNum}`)
      .setColor(0x95a5a6)
      .addFields(
        { name: "Type", value: `${config.emoji} ${config.label}`, inline: true },
        { name: "Opened by", value: `<@${ticket.userId}>`, inline: true },
        { name: "Closed by", value: `<@${closer.id}>`, inline: true },
        { name: "Duration", value: durationStr, inline: true },
        { name: "Messages", value: String(messages.length), inline: true },
      )
      .setFooter({ text: truncated ? "Transcript truncated at 500 messages · ahousedividedgame.com" : "ahousedividedgame.com" })
      .setTimestamp();

    const logChannelId = process.env.TICKET_LOG_CHANNEL_ID;
    if (logChannelId) {
      const logChannel = guild.channels.cache.get(logChannelId) as TextChannel | undefined;
      if (logChannel) {
        const buffer = Buffer.from(transcript, "utf-8");
        await logChannel.send({
          embeds: [logEmbed],
          files: [{ attachment: buffer, name: `ticket-${paddedNum}.txt` }],
        }).catch((err) => console.error("Failed to post transcript:", err));
      }
    }

    removeTicket(guild.id, channel.id);
    await channel.delete(`Ticket #${paddedNum} closed by ${closer.user.tag}`).catch(() => {});
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      const timedOutEmbed = new EmbedBuilder()
        .setTitle("Close Ticket?")
        .setDescription("Close timed out.")
        .setColor(0x5865f2);
      confirmMsg.edit({ embeds: [timedOutEmbed], components: [] }).catch(() => {});
    }
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors from `tickets.ts`

- [ ] **Step 3: Commit**

```bash
git add src/utils/tickets.ts
git commit -m "feat(tickets): add core ticket creation, closing, and transcript logic"
```

---

### Task 3: `/ticket` Command

**Files:**
- Create: `src/commands/ticket.ts`

- [ ] **Step 1: Create the ticket command**

```typescript
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
} from "discord.js";
import { createTicket } from "../utils/tickets.js";
import type { TicketCategory } from "../utils/ticketStore.js";

export const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Open a support ticket");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: "This command must be used in a server.", ephemeral: true });
    return;
  }

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket_category")
      .setPlaceholder("Select a ticket type...")
      .addOptions(
        { label: "Bug Report", value: "bug", emoji: "🐛", description: "Report a bug or issue" },
        { label: "Suggestion", value: "suggestion", emoji: "💡", description: "Suggest a feature or improvement" },
        { label: "Moderation Issue", value: "moderation", emoji: "🛡️", description: "Report a moderation concern" },
      ),
  );

  const reply = await interaction.reply({
    content: "What type of ticket would you like to open?",
    components: [selectRow],
    ephemeral: true,
  });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: (i) => i.user.id === interaction.user.id,
    time: 60_000,
    max: 1,
  });

  collector.on("collect", async (selectInteraction) => {
    await selectInteraction.deferUpdate();
    const category = selectInteraction.values[0] as TicketCategory;

    const result = await createTicket(
      interaction.guild!,
      interaction.user.id,
      interaction.user.username,
      category,
    );

    if (result.success) {
      await selectInteraction.editReply({
        content: `Ticket created: <#${result.channelId}>`,
        components: [],
      });
    } else {
      await selectInteraction.editReply({
        content: result.reason,
        components: [],
      });
    }
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      interaction.editReply({ content: "Ticket creation timed out.", components: [] }).catch(() => {});
    }
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/commands/ticket.ts
git commit -m "feat(tickets): add /ticket slash command with category select"
```

---

### Task 4: `/ticket-panel` Command

**Files:**
- Create: `src/commands/ticket-panel.ts`

- [ ] **Step 1: Create the ticket-panel command**

```typescript
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { addPanel } from "../utils/ticketStore.js";

export const data = new SlashCommandBuilder()
  .setName("ticket-panel")
  .setDescription("Post a ticket reaction panel in this channel (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({ content: "This command must be used in a server channel.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const embed = new EmbedBuilder()
    .setTitle("🎫 Support Tickets")
    .setDescription("React below to open a support ticket:")
    .addFields(
      { name: "🐛 Bug Report", value: "Report a bug or issue", inline: true },
      { name: "💡 Suggestion", value: "Suggest a feature or improvement", inline: true },
      { name: "🛡️ Moderation", value: "Report a moderation concern", inline: true },
    )
    .setColor(0x5865f2)
    .setFooter({ text: "ahousedividedgame.com" });

  const panelMsg = await interaction.channel.send({ embeds: [embed] });

  await panelMsg.react("🐛");
  await panelMsg.react("💡");
  await panelMsg.react("🛡️");

  addPanel(interaction.guild.id, panelMsg.id, interaction.channel.id);

  await interaction.editReply({ content: "Ticket panel posted!" });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/commands/ticket-panel.ts
git commit -m "feat(tickets): add /ticket-panel admin command"
```

---

### Task 5: `/close-ticket` Command

**Files:**
- Create: `src/commands/close-ticket.ts`

- [ ] **Step 1: Create the close-ticket command**

```typescript
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  GuildMember,
  ChannelType,
} from "discord.js";
import { closeTicket } from "../utils/tickets.js";

export const data = new SlashCommandBuilder()
  .setName("close-ticket")
  .setDescription("Close the current ticket channel");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({ content: "This command must be used in a server channel.", ephemeral: true });
    return;
  }

  if (interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "This command can only be used in a text channel.", ephemeral: true });
    return;
  }

  const member = interaction.member as GuildMember;
  await closeTicket(interaction.channel as TextChannel, member, interaction);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/commands/close-ticket.ts
git commit -m "feat(tickets): add /close-ticket command"
```

---

### Task 6: Wire Up `index.ts` — Button Handler, Reaction Hooks, Presence

**Files:**
- Modify: `src/index.ts:1-202`

- [ ] **Step 1: Add ticket imports**

Add after line 18 (`import { handleStarboardReaction } ...`):

```typescript
import { handlePanelReaction, handleLockReaction } from "./utils/tickets.js";
```

Note: `handlePanelReaction` and `handleLockReaction` don't exist yet in `tickets.ts`. We'll add them in step 4.

- [ ] **Step 2: Update bot presence**

Change line 68 from:
```typescript
activities: [{ name: "My father was a toolmaker", type: ActivityType.Custom }],
```
to:
```typescript
activities: [{ name: "/ticket for support", type: ActivityType.Custom }],
```

- [ ] **Step 3: Add button handler in `interactionCreate`**

Add after line 138 (after the `help_category` select menu handler, before `isAutocomplete`):

```typescript
  if (interaction.isButton() && interaction.customId === "ticket_close") {
    try {
      const { closeTicket } = await import("./utils/tickets.js");
      const member = interaction.guild?.members.cache.get(interaction.user.id)
        ?? await interaction.guild?.members.fetch(interaction.user.id);
      if (member && interaction.channel) {
        const { TextChannel } = await import("discord.js");
        if (interaction.channel instanceof TextChannel) {
          await closeTicket(interaction.channel, member, interaction);
        }
      }
    } catch (error) {
      console.error("Ticket close button error:", error);
    }
    return;
  }
```

- [ ] **Step 4: Add exported panel and lock reaction handlers to `tickets.ts`**

Add these two functions at the bottom of `src/utils/tickets.ts`:

```typescript
export async function handlePanelReaction(
  reaction: MessageReaction,
  user: User,
  guild: Guild,
): Promise<void> {
  if (!isPanel(guild.id, reaction.message.id)) return;

  // Remove user's reaction to keep panel clean
  await reaction.users.remove(user.id).catch(() => {});

  const emojiName = reaction.emoji.name;
  if (!emojiName || !(emojiName in PANEL_EMOJI_MAP)) return;
  const category = PANEL_EMOJI_MAP[emojiName];

  const result = await createTicket(guild, user.id, user.username, category);

  // Notify via DM (reactions can't reply ephemerally)
  try {
    if (result.success) {
      await user.send(`Your ${category} ticket has been created: <#${result.channelId}>`);
    } else {
      await user.send(result.reason);
    }
  } catch {
    // DMs disabled — ticket channel itself is the notification
  }
}

export async function handleLockReaction(
  reaction: MessageReaction,
  user: User,
  guild: Guild,
): Promise<void> {
  if (reaction.emoji.name !== "🔒") return;

  const ticket = getTicketByChannel(guild.id, reaction.message.channel.id);
  if (!ticket) return;

  const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id);
  if (!member) return;

  await closeTicket(reaction.message.channel as TextChannel, member);
}
```

Also update the imports at the top of `tickets.ts`:
1. Add `MessageReaction` and `User` to the discord.js import
2. Add `isPanel` to the ticketStore import (alongside the already-imported `getTicketByChannel`)

- [ ] **Step 5: Add reaction hooks in `index.ts`**

In the `messageReactionAdd` handler (around line 89-100), add ticket panel and lock handling **before** the starboard call. Replace the handler body:

```typescript
client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) return;
    const fullReaction = reaction.partial ? await reaction.fetch() : reaction;
    if (fullReaction.message.partial) await fullReaction.message.fetch();
    if (!fullReaction.message.guild) return;

    // Ticket panel reactions
    await handlePanelReaction(fullReaction, user, fullReaction.message.guild);

    // Ticket lock reaction (🔒)
    await handleLockReaction(fullReaction, user, fullReaction.message.guild);

    // Starboard
    await handleStarboardReaction(fullReaction, fullReaction.message.guild);
  } catch (error) {
    console.error("reactionAdd error:", error);
  }
});
```

- [ ] **Step 6: Verify full build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/index.ts src/utils/tickets.ts
git commit -m "feat(tickets): wire up button handler, reaction hooks, and presence in index.ts"
```

---

### Task 7: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add new env vars**

Add after the `INVESTOR_RANK_3_ROLE_ID` line:

```
# Ticket system (optional)
DEV_TEAM_ROLE_ID=your_dev_team_role_id_here
TICKET_LOG_CHANNEL_ID=your_ticket_log_channel_id_here
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "feat(tickets): add ticket system env vars to .env.example"
```

---

### Task 8: Full Build & Smoke Test

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Clean compile (only pre-existing `serverstats.ts` warnings if chart packages missing)

- [ ] **Step 2: Verify all command files are loadable**

Run: `ls dist/commands/ticket.js dist/commands/ticket-panel.js dist/commands/close-ticket.js`
Expected: All three files exist

- [ ] **Step 3: Final commit if any fixes needed**

If any fixes were needed, commit them:
```bash
git add -A
git commit -m "fix(tickets): resolve build issues"
```
