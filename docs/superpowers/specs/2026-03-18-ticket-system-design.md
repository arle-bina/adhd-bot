# Ticket System Design

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

A support ticket system for the AHD Discord bot. Users open tickets via a `/ticket` slash command or by reacting to a persistent panel embed. Each ticket creates a private channel under a dedicated "Tickets" category. Tickets are closed via button, reaction (`🔒`), or `/close-ticket` command — generating a transcript posted to a log channel before the ticket channel is deleted.

---

## Goals

- Give users a clear, low-friction way to report bugs, suggest features, or flag moderation issues
- Ping the Dev Team role on every new ticket
- Keep the server clean — tickets live in their own category and are deleted after transcription
- Prevent spam — one open ticket per category per user
- Provide accountability — transcripts are permanently logged

---

## New Files

| File | Purpose |
|------|---------|
| `src/commands/ticket.ts` | `/ticket` command — opens a ticket via select menu |
| `src/commands/ticket-panel.ts` | `/ticket-panel` command — admin posts a persistent reaction panel |
| `src/commands/close-ticket.ts` | `/close-ticket` command — closes a ticket from within the channel |
| `src/utils/ticketStore.ts` | JSON persistence for ticket state (`data/tickets.json`) |
| `src/utils/tickets.ts` | Core ticket logic: create channel, close + transcript, panel handling |

## Modified Files

| File | Change |
|------|--------|
| `src/index.ts` | Add `interaction.isButton()` branch for `ticket_close`; add panel reaction check in `messageReactionAdd`; add `🔒` close reaction handler; update bot presence |
| `.env.example` | Add `DEV_TEAM_ROLE_ID`, `TICKET_LOG_CHANNEL_ID` |

`src/utils/env.ts` is unchanged — new env vars are optional and read directly via `process.env` in `tickets.ts` (same pattern as other optional vars like `CEO_ROLE_ID`).

---

## Environment Variables

All optional (system degrades gracefully):

| Variable | Purpose | If missing |
|----------|---------|------------|
| `DEV_TEAM_ROLE_ID` | Role pinged on new tickets | No ping, ticket still created |
| `TICKET_LOG_CHANNEL_ID` | Channel where transcripts are posted | Transcript skipped, channel still deleted |

---

## Data Store (`ticketStore.ts`)

Follows the `starboardStore.ts` pattern. `loadData()` and `saveData()` are **module-private**. Only domain functions are exported. Persists to `data/tickets.json`.

```typescript
type TicketCategory = "bug" | "suggestion" | "moderation";

interface Ticket {
  userId: string;
  category: TicketCategory;
  channelId: string;
  createdAt: string;       // ISO timestamp
  ticketNumber: number;
}

interface TicketData {
  // guildId → channelId → Ticket
  tickets: Record<string, Record<string, Ticket>>;
  // guildId → messageId → panelChannelId (channel where panel embed lives)
  panels: Record<string, Record<string, string>>;
  // guildId → categoryChannelId (the Discord "Tickets" category)
  categoryIds: Record<string, string>;
  // guildId → auto-incrementing ticket number (per-guild, NOT per-category)
  counters: Record<string, number>;
}
```

### Exported functions

- `getTickets(guildId: string): Record<string, Ticket>`
- `addTicket(guildId: string, ticket: Ticket): void`
- `removeTicket(guildId: string, channelId: string): void`
- `getNextTicketNumber(guildId: string): number` — increments and saves
- `findOpenTicket(guildId: string, userId: string, category: TicketCategory): Ticket | undefined`
- `addPanel(guildId: string, messageId: string, panelChannelId: string): void`
- `isPanel(guildId: string, messageId: string): boolean`
- `getCategoryId(guildId: string): string | undefined`
- `setCategoryId(guildId: string, categoryId: string): void`

---

## Flow: Opening a Ticket

### Via `/ticket`

1. User runs `/ticket`
2. Bot replies ephemerally with a select menu (StringSelectMenu):
   - 🐛 Bug Report
   - 💡 Suggestion
   - 🛡️ Moderation Issue
3. User selects a category
4. **Race-condition guard:** acquire an in-memory lock (`Set<string>` keyed by `guildId:userId:category`). If locked, reply "Please wait, your ticket is being created." Release lock after channel creation or on error.
5. **One-per-category check:** `findOpenTicket(guildId, userId, category)` — also verifies the channel still exists via `guild.channels.cache.get()`. If channel is gone, cleans up the stale entry and proceeds.
   - If exists: reply "You already have an open {category} ticket: {channelMention}" — ephemeral, done
6. **Permission pre-check:** verify bot has `ManageChannels` in the guild. If not, reply with a clear error.
7. **Get or create "Tickets" category:** check `getCategoryId(guildId)` first; if stored ID still exists, use it. Otherwise search for a category channel named "Tickets"; create if missing. Store the ID via `setCategoryId()`.
8. **Create ticket channel:** `guild.channels.create()`
   - Name: `ticket-{category}-{username}-{number}` (e.g. `ticket-bug-john-0042`)
   - Parent: Tickets category
   - Permission overwrites:
     - `@everyone` → deny ViewChannel
     - Ticket creator → allow ViewChannel, SendMessages, ReadMessageHistory
     - Dev Team role → allow ViewChannel, SendMessages, ReadMessageHistory (if configured)
     - Bot → allow ViewChannel, SendMessages, ManageChannels, ManageMessages
9. **Post opening embed** in the ticket channel:
   - Title: "🎫 Bug Report — #0042"
   - Fields: Opened by (user mention), Category, Created (Discord timestamp)
   - Color: category-specific (bug=red `0xed4245`, suggestion=green `0x57f287`, moderation=yellow `0xfee75c`)
   - Footer: "ahousedividedgame.com"
   - Components: ActionRow with "Close Ticket" (danger button, custom ID: `ticket_close`)
10. **Ping Dev Team:** separate message `@DevTeam` (so the embed stays clean; skipped if `DEV_TEAM_ROLE_ID` not set)
11. **Save to store:** `addTicket()`
12. **Reply to user** ephemerally: "Ticket created: {channelMention}"
13. **Release lock**

### Via Panel (reaction-based)

1. Admin runs `/ticket-panel` (requires ManageChannels permission)
2. Bot posts a persistent embed in the current channel:
   - Title: "🎫 Support Tickets"
   - Description: "React below to open a ticket:"
   - Fields listing the three emojis and their categories
   - Color: blurple `0x5865f2`
3. Bot reacts to its own message with: 🐛 💡 🛡️
4. Saves panel message ID to store: `addPanel()`
5. When a user reacts to a panel message:
   - Bot removes the user's reaction (requires ManageMessages; keep panel clean)
   - Map emoji → category (🐛=bug, 💡=suggestion, 🛡️=moderation); ignore unmapped emojis
   - Follow steps 4–13 from the `/ticket` flow above
   - Since reactions don't produce interactions, notifications are sent via DM:
     - Success: "Your {category} ticket has been created: {channelMention}"
     - Duplicate: "You already have an open {category} ticket: {channelMention}"
     - Error: "Could not create your ticket. Please try `/ticket` instead."
   - If the user has DMs disabled, catch the error and silently fail (the ticket channel itself serves as confirmation)

---

## Flow: Closing a Ticket

### Three triggers, same outcome

1. **Button:** "Close Ticket" button (custom ID `ticket_close`) in the opening embed
2. **Reaction:** `🔒` emoji on any message in a ticket channel
3. **Command:** `/close-ticket` run inside a ticket channel

All three call `closeTicket()` from `tickets.ts`.

### `closeTicket()` signature

```typescript
export async function closeTicket(
  channel: TextChannel,
  closer: GuildMember,
  // Button interactions get a reply; reaction/command callers send a new message
  interaction?: ButtonInteraction | ChatInputCommandInteraction,
): Promise<void>
```

### Permission check

Closer must be either:
- The ticket creator (matched by `ticket.userId`)
- Someone with `ManageChannels` permission (mods/admins)

If neither, reject: "You don't have permission to close this ticket." (ephemeral for interactions, plain message for reaction trigger)

### Close sequence

1. **Confirm:** Post embed with Confirm (danger, custom ID `ticket_close_confirm`) + Cancel (secondary, custom ID `ticket_close_cancel`) buttons
   - "Are you sure you want to close this ticket? A transcript will be saved."
   - 30-second collector on the confirmation message (not routed through `index.ts` — these IDs are handled by the local collector only)
   - On timeout or Cancel: edit to "Close cancelled." and remove buttons
2. **On Confirm:**
   a. Fetch all messages in the channel using a `before` cursor loop (`channel.messages.fetch({ limit: 100, before })`) — repeat until no more messages or 500-message cap reached
   b. Build transcript `.txt` file:
      ```
      Ticket #0042 — Bug Report
      Opened by: username (userId)
      Closed by: modname (modId)
      Created: 2026-03-18T12:00:00Z
      Closed: 2026-03-18T14:30:00Z
      Messages: 23
      ---
      [2026-03-18 12:00:05] username: message content here
      [2026-03-18 12:01:12] modname: response here
      ...
      ```
   c. Build transcript embed for the log channel:
      - Title: "🎫 Ticket Closed — #0042"
      - Fields: Type, Opened by, Closed by, Duration, Message count
      - If transcript was truncated (hit 500 cap): add footer note "Transcript truncated at 500 messages"
      - Color: grey `0x95a5a6`
      - Attached: transcript `.txt` file
   d. Post to `TICKET_LOG_CHANNEL_ID` (if configured)
   e. Stop any active collectors on messages in this channel
   f. Delete the ticket channel
   g. `removeTicket()` from store

---

## Button Interaction Handling in `index.ts`

Add an `interaction.isButton()` branch **before** the `isChatInputCommand()` guard in the `interactionCreate` handler:

```typescript
if (interaction.isButton() && interaction.customId === "ticket_close") {
  // Route to closeTicket() — exact match only, NOT startsWith
  // ticket_close_confirm / ticket_close_cancel are handled by local collectors
  // inside closeTicket() and must NOT be intercepted here
}
```

Panel reactions are checked in the existing `messageReactionAdd` handler — call `isPanel()` before starboard logic. The `🔒` close reaction is checked by looking up whether the reaction's channel is a ticket channel in the store.

---

## Bot Presence Update

Change the activity in `index.ts` from:
```
"My father was a toolmaker"
```
to:
```
"/ticket for support"
```

---

## Channel Naming

Format: `ticket-{category}-{username}-{number}`
- Username sanitized: lowercase, non-alphanumeric replaced with nothing, consecutive hyphens collapsed, truncated to 15 chars
- Number: zero-padded 4 digits from the guild counter
- Discord auto-lowercases channel names and replaces spaces with hyphens
- Examples: `ticket-bug-john-0001`, `ticket-suggestion-player123-0042`

---

## Edge Cases

- **Bot restart:** Store is file-based, survives restarts. Ticket channels persist in Discord. On close, if the channel was manually deleted, `removeTicket()` cleans up the store gracefully.
- **User leaves server:** Ticket channel remains. Mods can still close it. Transcript will note the user's ID even if they've left.
- **Category channel deleted:** Bot detects the stored ID is invalid, re-creates the "Tickets" category, and updates the stored ID.
- **Log channel not configured:** Transcript step is skipped; channel is still deleted and store cleaned up.
- **Panel message deleted:** Reactions on it will fail silently. Admin can run `/ticket-panel` again.
- **Stale tickets in store:** `findOpenTicket()` verifies the channel still exists via `guild.channels.cache.get()`. If gone, removes the stale entry and allows a new ticket.
- **Bot lacks ManageChannels:** Pre-check on ticket creation; clear error message to the user.
- **User DMs disabled (panel flow):** DM send fails silently; the ticket channel itself is the fallback notification.
- **Concurrent ticket creation (double-click):** In-memory lock set prevents duplicate channels for the same user + category.
