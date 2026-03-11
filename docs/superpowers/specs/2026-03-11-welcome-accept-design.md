# Welcome Embed & /accept Command Design
**Date:** 2026-03-11

## Overview

When a new member joins the server, the bot posts a welcome embed in the welcome channel telling them to read the rules and run `/accept`. The `/accept` command assigns the member role.

## Components

### guildMemberAdd event
- Fires when a new member joins
- Posts an embed to channel `1470572208127475875`
- Embed mentions the new member, welcomes them, links to rules channel `1474142953437135142`, and instructs them to run `/accept`

### /accept slash command
- File: `src/commands/accept.ts`
- Checks if the user already has role `1470502115716894846`
- If not: assigns the role, replies ephemeral "✅ You've been given access to the server!"
- If already has it: replies ephemeral "You already have access."

## Files Changed
- Create: `src/commands/accept.ts`
- Modify: `src/index.ts` — add `GuildMembers` intent, add `guildMemberAdd` handler
- Modify: `src/register.ts` — add `/accept` to registration array

## Constants
- Welcome channel: `1470572208127475875`
- Rules channel: `1474142953437135142`
- Member role: `1470502115716894846`

## Requirements
- `GuildMembers` privileged intent must be enabled in Discord Developer Portal
- Bot needs Manage Roles permission and its role must be above the member role
