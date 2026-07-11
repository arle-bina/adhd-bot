/**
 * One-off: grant the Android tester role to everyone who reacted to an
 * announcement message, then exit.
 *
 * Run this where the bot token lives (the Oracle box), with the bot having the
 * "Manage Roles" permission and its role positioned ABOVE the Android tester
 * role in the server's role list (Discord will not let a bot assign a role
 * higher than its own).
 *
 * Env (add to the bot's .env, or pass inline):
 *   DISCORD_BOT_TOKEN        already set for the bot
 *   GUILD_ID                 the server id
 *   ANNOUNCE_CHANNEL_ID      channel the announcement is in
 *   ANNOUNCE_MESSAGE_ID      the announcement message id
 *   ANDROID_TESTER_ROLE_ID   the role to grant
 *   REACT_EMOJI              optional: only count this emoji (name or unicode,
 *                            e.g. "✅" or "android"); omit to count every reaction
 *
 * Usage:
 *   npx tsx scripts/grant-android-testers.ts            # dry run (lists, grants nothing)
 *   npx tsx scripts/grant-android-testers.ts --apply    # actually grant
 */
import { Client, GatewayIntentBits, Partials } from "discord.js";
import "dotenv/config";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const guildId = need("GUILD_ID");
  const channelId = need("ANNOUNCE_CHANNEL_ID");
  const messageId = need("ANNOUNCE_MESSAGE_ID");
  const roleId = need("ANDROID_TESTER_ROLE_ID");
  const wantEmoji = process.env.REACT_EMOJI?.trim();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });
  await client.login(need("DISCORD_BOT_TOKEN"));
  await new Promise<void>((r) => client.once("ready", () => r()));

  const guild = await client.guilds.fetch(guildId);
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) throw new Error("channel is not text-based");
  const message = await channel.messages.fetch(messageId);

  // Collect unique reactor ids across the relevant reaction(s).
  const reactorIds = new Set<string>();
  for (const reaction of message.reactions.cache.values()) {
    const e = reaction.emoji;
    if (wantEmoji && e.name !== wantEmoji && e.toString() !== wantEmoji && e.id !== wantEmoji) continue;
    let after: string | undefined;
    // Page through all users who reacted (100 per page).
    for (;;) {
      const users = await reaction.users.fetch({ limit: 100, after });
      if (users.size === 0) break;
      for (const u of users.values()) if (!u.bot) reactorIds.add(u.id);
      after = users.last()!.id;
      if (users.size < 100) break;
    }
  }

  console.log(`Reactors found: ${reactorIds.size}${wantEmoji ? ` (emoji: ${wantEmoji})` : " (all emojis)"}`);

  let granted = 0, already = 0, failed = 0;
  for (const id of reactorIds) {
    const member = await guild.members.fetch(id).catch(() => null);
    if (!member) { failed++; continue; }
    if (member.roles.cache.has(roleId)) { already++; continue; }
    if (!apply) { granted++; continue; }
    try {
      await member.roles.add(roleId, "Android app tester (reacted to announcement)");
      granted++;
    } catch (err) {
      failed++;
      console.error(`  grant failed for ${member.user.tag}:`, (err as Error).message);
    }
  }

  console.log(
    `${apply ? "Granted" : "Would grant"}: ${granted} | already had it: ${already} | failed/left guild: ${failed}`,
  );
  if (!apply) console.log("\nDry run. Re-run with --apply to grant for real.");
  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
