// Presentation for shared-pot rounds (race and lottery), used by the commands
// and by the scheduler that draws rounds nobody is watching.

import type { EmbedBuilder } from "discord.js";
import type { CasinoRound, RacerId } from "./api-casino.js";
import { baseEmbed, discordTime } from "./embeds.js";
import { CASINO_COLORS, money } from "./casino.js";

export const RACERS: { id: RacerId; name: string; emoji: string; style: string }[] = [
  { id: "turtle", name: "Turtle", emoji: "🐢", style: "slow and steady" },
  { id: "snake", name: "Snake", emoji: "🐍", style: "slips ahead in bursts" },
  { id: "rabbit", name: "Rabbit", emoji: "🐇", style: "fast but tires" },
  { id: "dragon", name: "Dragon", emoji: "🐉", style: "anything can happen" },
];
const TRACK = 20;

export function racer(id: RacerId | undefined) {
  return RACERS.find((r) => r.id === id) ?? RACERS[0];
}

/** Value held in a round, in anchor units, shown as a rough figure. */
function anchorLine(anchor: number): string {
  return `${Math.floor(anchor).toLocaleString("en-US")} INT`;
}

export function raceTrack(positions: number[]): string {
  const rows = RACERS.map((r, i) => {
    const pos = Math.max(0, Math.min(TRACK, Math.round(positions[i] ?? 0)));
    return `${"·".repeat(pos)}${r.emoji}${"·".repeat(TRACK - pos)}🏁`;
  });
  return rows.join("\n");
}

function betsLine(round: CasinoRound): string {
  if (round.entries.length === 0) return "_No bets yet._";
  return round.entries
    .slice(0, 20)
    .map((e) => `${racer(e.selection).emoji} **${e.characterName}** ${money(e.stake, e.currency)}`)
    .join("\n");
}

export function raceLobbyEmbed(round: CasinoRound): EmbedBuilder {
  const field = RACERS.map((r) => `${r.emoji} **${r.name}** · ${r.style}`).join("\n");
  return baseEmbed({
    title: "🏁 Animal race",
    description:
      `${field}\n\nEvery racer has the same chance. Winners split the pot, less a 5% house cut.\n` +
      `Bet with \`/race bet\`. Betting closes ${discordTime(new Date(round.closesAt))}.\n\n` +
      `**Pot:** ${anchorLine(round.potAnchor)}\n${betsLine(round)}`,
    color: CASINO_COLORS.table,
  });
}

export function raceFrameEmbed(positions: number[]): EmbedBuilder {
  return baseEmbed({ title: "🏁 And they're off", description: raceTrack(positions), color: CASINO_COLORS.table });
}

function payoutLines(round: CasinoRound): string {
  const payouts = round.payouts ?? [];
  if (payouts.length === 0) return "_Nobody to pay._";
  return payouts
    .slice(0, 20)
    .map((p) => `**${p.characterName}** ${p.kind === "refund" ? "refunded" : "wins"} ${money(p.amount, p.currency)}`)
    .join("\n");
}

export function raceResultEmbed(round: CasinoRound): EmbedBuilder {
  const frames = round.outcome?.frames ?? [];
  const winner = racer(round.outcome?.winner);
  const finish = frames.length > 0 ? `${raceTrack(frames[frames.length - 1])}\n\n` : "";
  const headline = round.outcome?.refunded
    ? `${winner.emoji} **${winner.name}** wins, but nobody backed it. Every stake is refunded.`
    : `${winner.emoji} **${winner.name}** wins.`;
  return baseEmbed({
    title: "🏁 Race result",
    description: `${finish}${headline}\n\n${payoutLines(round)}`,
    color: round.outcome?.refunded ? CASINO_COLORS.push : CASINO_COLORS.win,
  });
}

export const LOTTERY_TIER_LABEL = { low: "Low rollers", high: "High rollers" } as const;

export function lotteryEmbed(round: CasinoRound, viewerId?: string): EmbedBuilder {
  const tier = round.tier ?? "low";
  const tickets = round.entries.reduce((sum, e) => sum + (e.tickets ?? 0), 0);
  const mine = viewerId ? round.entries.find((e) => e.discordId === viewerId) : undefined;
  const lines = [
    `**Pot:** ${anchorLine(round.potAnchor)} · **Tickets sold:** ${tickets.toLocaleString("en-US")} · **Players:** ${round.entries.length}`,
    `**Ticket price:** ${anchorLine(round.ticketAnchor ?? 0)}, charged in your home currency`,
    `**Draw:** ${discordTime(new Date(round.closesAt))}. One ticket wins 90% of the pot.`,
  ];
  if (mine) lines.push(`You hold **${mine.tickets ?? 0}** ticket(s).`);
  return baseEmbed({ title: `🎟️ Lottery · ${LOTTERY_TIER_LABEL[tier]}`, description: lines.join("\n"), color: CASINO_COLORS.table });
}

export function lotteryResultEmbed(round: CasinoRound): EmbedBuilder {
  const tier = round.tier ?? "low";
  const winner = round.payouts?.find((p) => p.kind === "win");
  const tickets = round.entries.reduce((sum, e) => sum + (e.tickets ?? 0), 0);
  const description = winner
    ? `🎉 <@${winner.discordId}> (**${winner.characterName}**) wins **${money(winner.amount, winner.currency)}** from ${tickets.toLocaleString("en-US")} tickets.`
    : round.outcome?.refunded
      ? "The draw was called off and every ticket was refunded."
      : "The draw closed with no tickets sold.";
  return baseEmbed({ title: `🎟️ Lottery draw · ${LOTTERY_TIER_LABEL[tier]}`, description, color: CASINO_COLORS.win });
}
