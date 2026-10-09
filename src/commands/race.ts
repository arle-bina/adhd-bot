import { SlashCommandBuilder, ChatInputCommandInteraction, type Message } from "discord.js";
import {
  casinoRoundAction,
  createCasinoRound,
  listCasinoRounds,
  type CasinoRound,
  type RacerId,
} from "../utils/api-casino.js";
import { baseEmbed } from "../utils/embeds.js";
import { money, replyCasinoError, sleep, stakeOption } from "../utils/casino.js";
import { RACERS, raceFrameEmbed, raceLobbyEmbed, raceResultEmbed, racer } from "../utils/casinoRounds.js";

export const cooldown = 3;

/** Frames shown during the race; the server's frame list is sampled down to this. */
const SHOWN_FRAMES = 8;
const FRAME_MS = 900;

/** Race cards this process posted, so a new bet can refresh the right message. */
const lobbies = new Map<string, Message>();

export const data = new SlashCommandBuilder()
  .setName("race")
  .setDescription("Animal races: open one in this channel or bet on the one that is running")
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("Open a race in this channel")
      .addIntegerOption((opt) =>
        opt.setName("seconds").setDescription("How long betting stays open (15 to 300, default 45)").setMinValue(15).setMaxValue(300),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("bet")
      .setDescription("Bet on a racer in this channel's race")
      .addStringOption((opt) =>
        opt
          .setName("racer")
          .setDescription("Who wins")
          .setRequired(true)
          .addChoices(...RACERS.map((r) => ({ name: `${r.emoji} ${r.name}`, value: r.id }))),
      )
      .addIntegerOption((opt) => stakeOption(opt)),
  );

async function openRaceIn(channelId: string): Promise<CasinoRound | null> {
  const { rounds } = await listCasinoRounds({ game: "race", status: "open", channelId });
  return rounds.find((r) => new Date(r.closesAt).getTime() > Date.now()) ?? null;
}

/** Sample frames evenly, always keeping the finish. */
function sampleFrames(frames: number[][]): number[][] {
  if (frames.length <= SHOWN_FRAMES) return frames;
  const step = (frames.length - 1) / (SHOWN_FRAMES - 1);
  return Array.from({ length: SHOWN_FRAMES }, (_, i) => frames[Math.round(i * step)]);
}

async function runRace(interaction: ChatInputCommandInteraction, round: CasinoRound, message: Message): Promise<void> {
  const wait = new Date(round.closesAt).getTime() - Date.now();
  if (wait > 0) await sleep(wait + 500);
  lobbies.delete(round.channelId ?? "");
  let settled: CasinoRound;
  try {
    settled = (await casinoRoundAction(round.roundId, { action: "settle", discordId: interaction.user.id })).round;
  } catch (error) {
    console.error(`[race] settle ${round.roundId} failed`, error);
    await message.edit({
      embeds: [baseEmbed({ title: "🏁 Race", description: "The race could not be run just now. It will be drawn automatically and stakes are safe." })],
    });
    return;
  }
  if (settled.status === "cancelled" && !settled.outcome?.frames) {
    await message.edit({
      embeds: [baseEmbed({ title: "🏁 Race called off", description: settled.outcome?.reason ?? "No bets were placed." })],
    });
    return;
  }
  for (const frame of sampleFrames(settled.outcome?.frames ?? [])) {
    await message.edit({ embeds: [raceFrameEmbed(frame)] });
    await sleep(FRAME_MS);
  }
  await message.edit({ embeds: [raceResultEmbed(settled)] });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand(true);
  const channelId = interaction.channelId;

  if (sub === "start") {
    await interaction.deferReply();
    try {
      if (await openRaceIn(channelId)) {
        await interaction.editReply({ content: "A race is already taking bets in this channel. Use `/race bet`." });
        return;
      }
      const seconds = interaction.options.getInteger("seconds") ?? undefined;
      const { round } = await createCasinoRound({
        game: "race",
        discordId: interaction.user.id,
        channelId,
        bettingSeconds: seconds,
      });
      const message = await interaction.editReply({ embeds: [raceLobbyEmbed(round)] });
      lobbies.set(channelId, message);
      void runRace(interaction, round, message).catch((error) => console.error("[race] run failed", error));
    } catch (error) {
      await replyCasinoError(interaction, "race", error);
    }
    return;
  }

  const selection = interaction.options.getString("racer", true) as RacerId;
  const stake = interaction.options.getInteger("stake", true);
  await interaction.deferReply({ ephemeral: true });
  try {
    const open = await openRaceIn(channelId);
    if (!open) {
      await interaction.editReply({ content: "No race is taking bets in this channel. Start one with `/race start`." });
      return;
    }
    const entered = await casinoRoundAction(open.roundId, {
      action: "enter",
      discordId: interaction.user.id,
      stake,
      selection,
    });
    const pick = racer(selection);
    await interaction.editReply({
      content: `${pick.emoji} You put ${money(entered.stake ?? stake, entered.currency ?? "")} on the **${pick.name}**.`,
    });
    const lobby = lobbies.get(channelId);
    if (lobby) await lobby.edit({ embeds: [raceLobbyEmbed(entered.round)] }).catch(() => undefined);
  } catch (error) {
    await replyCasinoError(interaction, "race", error);
  }
}
