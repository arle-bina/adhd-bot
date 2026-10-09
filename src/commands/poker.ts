import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ButtonInteraction,
  type Message,
} from "discord.js";
import { casinoRoundAction, createCasinoRound, type CasinoRound } from "../utils/api-casino.js";
import { baseEmbed, discordTime } from "../utils/embeds.js";
import { CASINO_COLORS, followUpCasinoError, money, replyCasinoError } from "../utils/casino.js";
import {
  act,
  cardLabel,
  chipCounts,
  createTable,
  finishHand,
  legalActions,
  potSize,
  startHand,
  tableFinished,
  type HandResult,
  type PokerTable,
} from "../utils/pokerEngine.js";

export const cooldown = 5;

const LOBBY_MS = 15 * 60_000;
/** The server refunds a table after three hours; cash it out well before that. */
const TABLE_MS = 150 * 60_000;
const TURN_MS = 60_000;
const BETWEEN_HANDS_MS = 6_000;
const STARTING_BIG_BLIND = 20;
const HANDS_PER_LEVEL = 10;

export const data = new SlashCommandBuilder()
  .setName("poker")
  .setDescription("Open a Texas hold'em table for other players to join")
  .addIntegerOption((opt) =>
    opt.setName("buyin").setDescription("Buy-in per player, in your home currency").setRequired(true).setMinValue(1),
  )
  .addIntegerOption((opt) => opt.setName("seats").setDescription("Most players (2 to 8, default 8)").setMinValue(2).setMaxValue(8));

function lobbyEmbed(round: CasinoRound, buyIn: string) {
  const seated = round.entries.map((e, i) => `${i + 1}. **${e.characterName}** (<@${e.discordId}>)`).join("\n");
  return baseEmbed({
    title: "♠️ Hold'em table",
    description:
      `**Buy-in:** ${buyIn} each, converted to every player's home currency.\n` +
      `Everyone starts with ${round.startingChips ?? 1000} chips. The table pays out by final chip count, less 5% of any profit.\n` +
      `Seats: ${round.entries.length}/${round.maxPlayers ?? 8}. The host starts once two or more have joined.\n\n${seated}`,
    color: CASINO_COLORS.table,
  });
}

function lobbyButtons(prefix: string, canStart: boolean) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}_join`).setLabel("Join").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${prefix}_start`).setLabel("Start").setStyle(ButtonStyle.Primary).setDisabled(!canStart),
    new ButtonBuilder().setCustomId(`${prefix}_cancel`).setLabel("Cancel table").setStyle(ButtonStyle.Danger),
  );
}

function tableEmbed(t: PokerTable, note: string, deadline: number | null) {
  const board = t.board.length > 0 ? t.board.map(cardLabel).join(" ") : "_no cards yet_";
  const seats = t.seats
    .map((s, i) => {
      const marks = [i === t.dealer ? "🔘" : "", i === t.toAct ? "👉" : ""].join("");
      const state = s.busted ? "out" : s.folded ? "folded" : s.allIn ? "all in" : "";
      const bet = s.streetBet > 0 ? ` · bet ${s.streetBet}` : "";
      return `${marks}**${s.name}** ${s.stack} chips${bet}${state ? ` · _${state}_` : ""}`;
    })
    .join("\n");
  const turn = t.toAct >= 0 && deadline ? `\n\n**${t.seats[t.toAct].name}** to act, ${discordTime(new Date(deadline))}.` : "";
  return baseEmbed({
    title: `♠️ Hand ${t.handNumber} · blinds ${t.smallBlind}/${t.bigBlind}`,
    description: `**Board:** ${board}\n**Pot:** ${potSize(t)}\n\n${seats}${turn}\n\n${note}`,
    color: CASINO_COLORS.table,
  });
}

function actionButtons(t: PokerTable, prefix: string) {
  const legal = legalActions(t);
  const rows = [new ActionRowBuilder<ButtonBuilder>()];
  if (legal) {
    const pot = potSize(t);
    const potRaise = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, t.currentBet + pot + legal.toCall));
    rows[0].addComponents(
      new ButtonBuilder().setCustomId(`${prefix}_fold`).setLabel("Fold").setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${prefix}_call`)
        .setLabel(legal.canCheck ? "Check" : `Call ${legal.toCall}`)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${prefix}_min`)
        .setLabel(`Raise to ${legal.minRaiseTo}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!legal.canRaise || legal.minRaiseTo >= legal.maxRaiseTo),
      new ButtonBuilder()
        .setCustomId(`${prefix}_pot`)
        .setLabel(`Pot ${potRaise}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!legal.canRaise || potRaise <= legal.minRaiseTo || potRaise >= legal.maxRaiseTo),
      new ButtonBuilder()
        .setCustomId(`${prefix}_allin`)
        .setLabel(`All in ${legal.maxRaiseTo}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!legal.canRaise),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${prefix}_cards`).setLabel("My cards").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${prefix}_end`).setLabel("Host: end table").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows.filter((r) => r.components.length > 0);
}

function handSummary(t: PokerTable, result: HandResult): string {
  const name = (id: string) => t.seats.find((s) => s.id === id)?.name ?? id;
  const shown = Object.entries(result.shown).map(([id, cards]) => `${name(id)}: ${cards.map(cardLabel).join(" ")}`);
  const winners = result.winners.map((w) => `**${name(w.id)}** takes ${w.amount} (${w.hand})`);
  return [...winners, ...(shown.length > 0 ? ["", ...shown] : [])].join("\n");
}

/** Run hands until one player has every chip, the host ends it, or the table times out. */
async function runTable(round: CasinoRound, message: Message, hostId: string, buyIn: string): Promise<void> {
  const prefix = `pk_${round.roundId}`;
  const table = createTable(
    round.entries.map((e) => ({ id: e.discordId, name: e.characterName })),
    round.startingChips ?? 1000,
    STARTING_BIG_BLIND,
  );
  const startedAt = Date.now();
  let ending = false;
  let closed = false;
  let deadline: number | null = null;
  let turnTimer: NodeJS.Timeout | null = null;
  let queue: Promise<void> = Promise.resolve();
  let finishTable: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => (finishTable = resolve));

  const render = async (note: string) => {
    await message.edit({ embeds: [tableEmbed(table, note, deadline)], components: actionButtons(table, prefix) }).catch(() => undefined);
  };

  const cashOut = async (reason: string) => {
    if (closed) return;
    closed = true;
    if (turnTimer) clearTimeout(turnTimer);
    collector.stop("done");
    const chips = chipCounts(table);
    let settled: CasinoRound | null = null;
    try {
      settled = (await casinoRoundAction(round.roundId, { action: "settle", discordId: hostId, chips })).round;
    } catch (error) {
      console.error(`[poker] settle ${round.roundId} failed`, error);
    }
    const standings = table.seats
      .slice()
      .sort((a, b) => chips[b.id] - chips[a.id])
      .map((s) => {
        const paid = settled?.payouts?.find((p) => p.discordId === s.id);
        return `**${s.name}** ${chips[s.id]} chips${paid ? ` · ${money(paid.amount, paid.currency)}` : ""}`;
      });
    const footer = settled
      ? `Buy-in was ${buyIn}. Winnings are in your character's wallet.`
      : "The table could not be cashed out just now. Every buy-in will be refunded automatically.";
    await message
      .edit({
        embeds: [baseEmbed({ title: "♠️ Table closed", description: `${reason}\n\n${standings.join("\n")}\n\n${footer}`, color: CASINO_COLORS.win })],
        components: [],
      })
      .catch(() => undefined);
    finishTable();
  };

  const nextHand = async () => {
    if (closed) return;
    if (ending || tableFinished(table) || Date.now() - startedAt > TABLE_MS) {
      const reason = tableFinished(table)
        ? `**${table.seats.find((s) => !s.busted)?.name}** holds every chip.`
        : ending
          ? "The host ended the table."
          : "The table reached its time limit.";
      await cashOut(reason);
      return;
    }
    const level = Math.floor(table.handNumber / HANDS_PER_LEVEL);
    table.bigBlind = STARTING_BIG_BLIND * 2 ** level;
    table.smallBlind = table.bigBlind / 2;
    startHand(table, Math.random);
    await afterMove("New hand. Press **My cards** to see your hole cards.");
  };

  const afterMove = async (note: string) => {
    if (turnTimer) clearTimeout(turnTimer);
    if (table.toAct < 0) {
      deadline = null;
      const result = finishHand(table);
      await render(`${table.log.slice(-3).join("\n")}\n\n${handSummary(table, result)}`);
      setTimeout(() => enqueue(nextHand), BETWEEN_HANDS_MS);
      return;
    }
    deadline = Date.now() + TURN_MS;
    const seat = table.seats[table.toAct];
    turnTimer = setTimeout(
      () =>
        enqueue(async () => {
          if (table.toAct < 0 || table.seats[table.toAct].id !== seat.id) return;
          const legal = legalActions(table)!;
          act(table, seat.id, legal.canCheck ? { type: "check" } : { type: "fold" });
          await afterMove(`${seat.name} ran out of time.`);
        }),
      TURN_MS,
    );
    await render(note || table.log.slice(-2).join("\n"));
  };

  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task).catch((error) => console.error("[poker] table step failed", error));
  };

  const seatedIds = new Set(table.seats.map((s) => s.id));
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: TABLE_MS + 10 * 60_000,
    filter: (i) => i.customId.startsWith(prefix),
  });

  collector.on("collect", (btn: ButtonInteraction) => {
    const action = btn.customId.slice(prefix.length + 1);
    if (!seatedIds.has(btn.user.id)) {
      void btn.reply({ content: "You are not seated at this table.", ephemeral: true }).catch(() => undefined);
      return;
    }
    if (action === "cards") {
      const seat = table.seats.find((s) => s.id === btn.user.id)!;
      const hole = seat.hole.length > 0 ? seat.hole.map(cardLabel).join(" ") : "No cards this hand.";
      void btn.reply({ content: `Your cards: **${hole}**`, ephemeral: true }).catch(() => undefined);
      return;
    }
    if (action === "end") {
      if (btn.user.id !== hostId) {
        void btn.reply({ content: "Only the host can end the table.", ephemeral: true }).catch(() => undefined);
        return;
      }
      ending = true;
      void btn
        .reply({ content: table.handOpen ? "The table closes now. The hand in play is void and its bets go back." : "Closing the table.", ephemeral: true })
        .catch(() => undefined);
      enqueue(async () => {
        if (table.handOpen) await cashOut("The host ended the table.");
      });
      return;
    }
    enqueue(async () => {
      if (table.toAct < 0 || table.seats[table.toAct].id !== btn.user.id) {
        await btn.reply({ content: "It is not your turn.", ephemeral: true }).catch(() => undefined);
        return;
      }
      const legal = legalActions(table)!;
      const pot = potSize(table);
      const move =
        action === "fold"
          ? ({ type: "fold" } as const)
          : action === "call"
            ? ({ type: "call" } as const)
            : action === "min"
              ? ({ type: "raise", to: legal.minRaiseTo } as const)
              : action === "pot"
                ? ({ type: "raise", to: Math.min(legal.maxRaiseTo, table.currentBet + pot + legal.toCall) } as const)
                : ({ type: "raise", to: legal.maxRaiseTo } as const);
      await btn.deferUpdate().catch(() => undefined);
      if (!act(table, btn.user.id, move)) {
        await btn.followUp({ content: "That move is not allowed right now.", ephemeral: true }).catch(() => undefined);
        return;
      }
      await afterMove("");
    });
  });

  collector.on("end", (_, reason) => {
    if (reason !== "done") enqueue(() => cashOut("The table timed out."));
  });

  enqueue(nextHand);
  await finished;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const buyIn = interaction.options.getInteger("buyin", true);
  const seats = interaction.options.getInteger("seats") ?? undefined;
  const hostId = interaction.user.id;
  await interaction.deferReply();

  let round: CasinoRound;
  let buyInLabel: string;
  try {
    round = (await createCasinoRound({ game: "poker", discordId: hostId, channelId: interaction.channelId, buyIn, maxPlayers: seats })).round;
    const seated = await casinoRoundAction(round.roundId, { action: "enter", discordId: hostId });
    round = seated.round;
    buyInLabel = money(seated.stake ?? buyIn, seated.currency ?? "");
  } catch (error) {
    await replyCasinoError(interaction, "poker", error);
    return;
  }

  const prefix = `pkl_${round.roundId}`;
  const message = await interaction.editReply({ embeds: [lobbyEmbed(round, buyInLabel)], components: [lobbyButtons(prefix, false)] });
  const lobby = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: LOBBY_MS,
    filter: (i) => i.customId.startsWith(prefix),
  });

  lobby.on("collect", async (btn) => {
    const action = btn.customId.slice(prefix.length + 1);
    if ((action === "start" || action === "cancel") && btn.user.id !== hostId) {
      await btn.reply({ content: "Only the host can do that.", ephemeral: true });
      return;
    }
    await btn.deferUpdate();
    try {
      if (action === "join") {
        round = (await casinoRoundAction(round.roundId, { action: "enter", discordId: btn.user.id })).round;
        await message.edit({ embeds: [lobbyEmbed(round, buyInLabel)], components: [lobbyButtons(prefix, round.entries.length >= 2)] });
      } else if (action === "cancel") {
        lobby.stop("cancelled");
        await casinoRoundAction(round.roundId, { action: "cancel", discordId: hostId, reason: "Cancelled by the host" });
        await message.edit({
          embeds: [baseEmbed({ title: "♠️ Table cancelled", description: "Every buy-in has been refunded." })],
          components: [],
        });
      } else if (action === "start") {
        round = (await casinoRoundAction(round.roundId, { action: "start", discordId: hostId })).round;
        lobby.stop("started");
        await runTable(round, message, hostId, buyInLabel);
      }
    } catch (error) {
      await followUpCasinoError(btn, error);
    }
  });

  lobby.on("end", async (_, reason) => {
    if (reason === "started" || reason === "cancelled") return;
    try {
      await casinoRoundAction(round.roundId, { action: "cancel", discordId: hostId, reason: "Nobody started the table" });
      await message.edit({
        embeds: [baseEmbed({ title: "♠️ Table closed", description: "The table never started. Every buy-in has been refunded." })],
        components: [],
      });
    } catch (error) {
      console.error(`[poker] lobby cleanup ${round.roundId} failed`, error);
    }
  });
}
