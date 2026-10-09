// Draws lotteries when they close, and any race whose command process died
// before running it. The game server also sweeps abandoned rounds, so this is
// about announcing results, not about keeping money safe.

import type { Client, TextBasedChannel } from "discord.js";
import { casinoRoundAction, listCasinoRounds, type CasinoRound } from "./api-casino.js";
import { lotteryResultEmbed, raceResultEmbed } from "./casinoRounds.js";

const POLL_MS = 60_000;
/** The race command draws its own race at close; only step in once it is clearly overdue. */
const RACE_GRACE_MS = 30_000;

let running = false;

async function announce(client: Client, round: CasinoRound): Promise<void> {
  if (!round.channelId) return;
  const channel = await client.channels.fetch(round.channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("send" in channel)) return;
  const embed = round.game === "lottery" ? lotteryResultEmbed(round) : raceResultEmbed(round);
  await (channel as TextBasedChannel & { send: (o: object) => Promise<unknown> }).send({ embeds: [embed] });
}

async function drawDueRounds(client: Client): Promise<void> {
  const { rounds } = await listCasinoRounds({ due: true });
  const botId = client.user?.id ?? "scheduler";
  for (const round of rounds) {
    if (round.game === "race" && Date.now() - new Date(round.closesAt).getTime() < RACE_GRACE_MS) continue;
    try {
      const { round: settled } = await casinoRoundAction(round.roundId, { action: "settle", discordId: botId });
      await announce(client, settled);
    } catch (error) {
      console.error(`[casino] drawing ${round.game} ${round.roundId} failed`, error);
    }
  }
}

export function startCasinoScheduler(client: Client): void {
  setInterval(() => {
    if (running) return;
    running = true;
    drawDueRounds(client)
      .catch((error) => console.error("[casino] scheduler poll failed", error))
      .finally(() => {
        running = false;
      });
  }, POLL_MS);
}
