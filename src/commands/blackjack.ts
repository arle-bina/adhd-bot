import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type Message,
} from "discord.js";
import {
  getBlackjackFund,
  getBlackjackBalance,
  postBlackjackPlaceWager,
  postBlackjackResolve,
  type BlackjackResolveResponse,
} from "../utils/api.js";
import {
  createShoe,
  draw,
  handTotal,
  isBlackjack,
  dealerHits,
  cardLabel,
  type Card,
} from "../utils/blackjackGame.js";
import { replyWithError, standardFooter } from "../utils/helpers.js";
import { currencyFor, formatCurrency, symbolFor, convertCurrency, fetchForexRates, CURRENCY_CHOICES } from "../utils/currency.js";

export const cooldown = 10;

const MAX_WAGER = 50_000_000;
const COLLECTOR_MS = 5 * 60_000;
const FELT_GREEN = 0x0d3b2c;

/** Build a forex-aware footer for blackjack. */
function blackjackFooter(displayCurrency: string, nativeCc: string, rates: Record<string, number>, extra?: string): { text: string } {
  const parts: string[] = [];
  if (extra) parts.push(extra);
  if (displayCurrency !== nativeCc && displayCurrency !== "USD" && rates[displayCurrency] && rates[displayCurrency] !== 1) {
    const sym = { USD: "$", GBP: "£", JPY: "¥", CAD: "C$", EUR: "€" }[displayCurrency] ?? displayCurrency;
    const rateVal = displayCurrency === "JPY" ? rates[displayCurrency].toFixed(2) : rates[displayCurrency].toFixed(4);
    parts.push(`1 INT = ${sym}${rateVal} ${displayCurrency}`);
  }
  if (displayCurrency !== nativeCc) {
    parts.push(`Displayed in ${displayCurrency} (native: ${nativeCc})`);
  }
  parts.push("ahousedividedgame.com");
  return { text: parts.join(" · ") };
}

export const data = new SlashCommandBuilder()
  .setName("blackjack")
  .setDescription("Play blackjack against the house using your character's cash on hand")
  .addSubcommand((sub) =>
    sub.setName("pool").setDescription("Show the shared blackjack prize pool balance")
  )
  .addSubcommand((sub) =>
    sub
      .setName("play")
      .setDescription("Play one hand — wager liquid capital from your linked character")
      .addIntegerOption((opt) =>
        opt
          .setName("wager")
          .setDescription("Amount to wager (LC)")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(MAX_WAGER)
      )
      .addStringOption((opt) =>
        opt
          .setName("currency")
          .setDescription("Display currency for results (default: your character's home currency)")
          .setRequired(false)
          .addChoices(...CURRENCY_CHOICES)
      )
  );

function formatHand(cards: Card[], hideSecond: boolean): string {
  if (hideSecond && cards.length >= 2) {
    return `${cardLabel(cards[0])} · ??`;
  }
  return cards.map(cardLabel).join(" · ");
}

function formatHandSpaced(cards: Card[]): string {
  return cards.map(cardLabel).join(" ");
}

function outcomeTitle(
  kind: "win" | "loss" | "push",
  natural: boolean
): string {
  if (kind === "push") return "Push";
  if (kind === "win") return natural ? "Blackjack!" : "You win";
  return "House wins";
}

function outcomeEmoji(kind: "win" | "loss" | "push"): string {
  if (kind === "push") return "🔁";
  if (kind === "win") return "✅";
  return "❌";
}

function buildTableEmbed(params: {
  playerName: string;
  wagerDisplay: string;
  playerCards: Card[];
  dealerCards: Card[];
  hideHole: boolean;
  statusLine: string;
  footerNote?: string;
  displayCurrency: string;
  nativeCc: string;
  rates: Record<string, number>;
}): EmbedBuilder {
  const pTotal = handTotal(params.playerCards);
  const dLine = params.hideHole
    ? formatHand(params.dealerCards, true)
    : `${formatHand(params.dealerCards, false)} (${handTotal(params.dealerCards)})`;

  const pLine =
    params.playerCards.length > 0
      ? `${formatHand(params.playerCards, false)} (${pTotal})`
      : "—";

  return new EmbedBuilder()
    .setTitle("Blackjack")
    .setColor(FELT_GREEN)
    .setDescription(params.statusLine)
    .addFields(
      { name: "Player", value: params.playerName, inline: true },
      { name: "Wager", value: `${params.wagerDisplay} LC`, inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "Your hand", value: pLine, inline: false },
      { name: "Dealer", value: dLine, inline: false }
    )
    .setFooter(blackjackFooter(params.displayCurrency, params.nativeCc, params.rates, params.footerNote));
}

function buildResultEmbed(params: {
  characterName: string;
  wagerDisplay: string;
  playerCards: Card[];
  dealerCards: Card[];
  kind: "win" | "loss" | "push";
  naturalWin: boolean;
  detailLine?: string;
  resolve: BlackjackResolveResponse;
  displayCurrency: string;
  nativeCc: string;
  rates: Record<string, number>;
}): EmbedBuilder {
  const pTotal = handTotal(params.playerCards);
  const dTotal = handTotal(params.dealerCards);
  const title = outcomeTitle(params.kind, params.naturalWin);
  const emoji = outcomeEmoji(params.kind);
  const headline = params.detailLine
    ? `${emoji} **${title}** — ${params.detailLine}`
    : `${emoji} **${title}**`;

  const { previousCash, newCash, payout } = params.resolve;
  const cvt = (n: number) => Math.round(convertCurrency(n, params.nativeCc, params.displayCurrency, params.rates));
  const fmt = (n: number) => formatCurrency(n, params.displayCurrency);
  const sym = symbolFor(params.displayCurrency);

  // Convert all monetary values to display currency
  const prevConverted = cvt(previousCash);
  const newConverted = cvt(newCash);
  const net = newConverted - prevConverted;
  const netLabel =
    net === 0
      ? `${sym}0`
      : net > 0
        ? `+${fmt(net)}`
        : `-${fmt(Math.abs(net))}`;

  const payoutConverted = payout != null ? cvt(payout) : null;

  let payoutLine: string;
  if (params.kind === "win") {
    const amount = payoutConverted ?? cvt(Math.round(params.wagerDisplay ? 0 : 0)); // fallback
    // Recalculate: if payout is raw native value, convert it
    const rawPayout = payout != null ? payout : Math.round(params.naturalWin ? 1.5 : 1); // multiplier only, not used directly
    const displayPayout = payoutConverted ?? 0;
    payoutLine = `💰 **Payout:** ${fmt(displayPayout)}`;
  } else if (params.kind === "push") {
    payoutLine = "💰 **Payout:** Stake returned (push)";
  } else {
    payoutLine = `💰 **Payout:** ${sym}0`;
  }

  const body =
    `**Player:** ${params.characterName}\n` +
    `**Wager:** ${params.wagerDisplay}\n\n` +
    `🃏 **Your hand:** ${formatHandSpaced(params.playerCards)} (${pTotal})\n` +
    `🎴 **Dealer:** ${formatHandSpaced(params.dealerCards)} (${dTotal})\n\n` +
    `${headline}\n\n` +
    `${payoutLine}\n` +
    `💵 **LC before:** ${fmt(prevConverted)}\n` +
    `💵 **LC after:** ${fmt(newConverted)} (${netLabel} net)`;

  return new EmbedBuilder()
    .setTitle("🎰 Blackjack result")
    .setColor(FELT_GREEN)
    .setDescription(body)
    .setFooter(blackjackFooter(params.displayCurrency, params.nativeCc, params.rates));
}

async function resolveHand(
  discordId: string,
  gameId: string,
  kind: "win" | "loss" | "push",
  naturalWin: boolean
): Promise<BlackjackResolveResponse> {
  if (kind === "push") {
    return postBlackjackResolve({ discordId, gameId, result: "push" });
  }
  if (kind === "loss") {
    return postBlackjackResolve({ discordId, gameId, result: "loss" });
  }
  return postBlackjackResolve({
    discordId,
    gameId,
    result: "win",
    payoutMultiplier: naturalWin ? 1.5 : 1,
  });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand(true);

  if (sub === "pool") {
    await interaction.deferReply();
    try {
      const [fund, rates] = await Promise.all([
        getBlackjackFund(),
        fetchForexRates(),
      ]);
      if (!fund.found) {
        await interaction.editReply({
          content: "The blackjack prize pool has not been initialized yet.",
        });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle("Blackjack prize pool")
        .setColor(FELT_GREEN)
        .setDescription(
          `**Balance:** ${formatCurrency(fund.balance, "USD")} LC\n` +
            (fund.gamesPlayed != null ? `**Hands recorded:** ${fund.gamesPlayed.toLocaleString()}\n` : "") +
            (fund.totalWagered != null ? `**Total wagered (tracked):** ${formatCurrency(fund.totalWagered, "USD")} LC\n` : "")
        )
        .setFooter({ text: "ahousedividedgame.com" });
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await replyWithError(interaction, "blackjack", error);
    }
    return;
  }

  // play
  const wager = interaction.options.getInteger("wager", true);
  const explicitCurrency = interaction.options.getString("currency");
  await interaction.deferReply();

  const gameId = `bj_${interaction.id}`;
  const discordId = interaction.user.id;

  let characterName: string;
  let cc: string;
  let rates: Record<string, number>;
  try {
    const [bal, fxRates] = await Promise.all([
      getBlackjackBalance(discordId),
      fetchForexRates(),
    ]);
    characterName = bal.characterName;
    cc = currencyFor(bal.countryId);
    rates = fxRates;
    if (bal.cashOnHand < wager) {
      await interaction.editReply({
        content: `You only have **${formatCurrency(bal.cashOnHand, cc)} LC** on hand; you cannot wager **${formatCurrency(wager, cc)}**.`,
      });
      return;
    }
  } catch (err) {
    await replyWithError(interaction, "blackjack", err);
    return;
  }

  const displayCurrency = explicitCurrency || cc;
  const cvt = (n: number) => Math.round(convertCurrency(n, cc, displayCurrency, rates));
  const fmt = (n: number) => formatCurrency(n, displayCurrency);

  try {
    await postBlackjackPlaceWager({ discordId, wagerAmount: wager, gameId });
  } catch (err) {
    await replyWithError(interaction, "blackjack", err);
    return;
  }

  const prefix = `bj_${interaction.id}`;
  const idHit = `${prefix}_hit`;
  const idStand = `${prefix}_stand`;

  const shoe = createShoe();
  const player: Card[] = [draw(shoe), draw(shoe)];
  const dealer: Card[] = [draw(shoe), draw(shoe)];

  const runDealer = (): void => {
    while (dealerHits(dealer)) {
      dealer.push(draw(shoe));
    }
  };

  let finalized = false;

  const wagerDisplay = fmt(cvt(wager));

  const finalize = async (
    kind: "win" | "loss" | "push",
    naturalWin: boolean,
    detailLine?: string,
    targetMessage?: Message
  ): Promise<void> => {
    if (finalized) return;
    finalized = true;
    let resolve: BlackjackResolveResponse;
    try {
      resolve = await resolveHand(discordId, gameId, kind, naturalWin);
    } catch (err) {
      finalized = false;
      await replyWithError(interaction, "blackjack", err);
      return;
    }
    const embed = buildResultEmbed({
      characterName,
      wagerDisplay,
      playerCards: player,
      dealerCards: dealer,
      kind,
      naturalWin,
      detailLine,
      resolve,
      displayCurrency,
      nativeCc: cc,
      rates,
    });
    const payload = { embeds: [embed], components: [] as [] };
    if (targetMessage) {
      await targetMessage.edit(payload);
    } else {
      await interaction.editReply(payload);
    }
  };

  // Natural blackjack or immediate resolution
  const pBj = isBlackjack(player);
  const dBj = isBlackjack(dealer);

  if (pBj || dBj) {
    if (pBj && dBj) {
      await finalize("push", false, "both you and the dealer have blackjack");
      return;
    }
    if (pBj) {
      await finalize("win", true, "natural blackjack");
      return;
    }
    await finalize("loss", false, "dealer has blackjack");
    return;
  }

  const initialEmbed = buildTableEmbed({
    playerName: characterName,
    wagerDisplay,
    playerCards: player,
    dealerCards: dealer,
    hideHole: true,
    statusLine: "Hit or stand — dealer stands on all 17s.",
    displayCurrency,
    nativeCc: cc,
    rates,
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(idHit).setLabel("Hit").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(idStand).setLabel("Stand").setStyle(ButtonStyle.Secondary)
  );

  const message = await interaction.editReply({
    embeds: [initialEmbed],
    components: [row],
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: COLLECTOR_MS,
    filter: (i) => i.user.id === interaction.user.id && (i.customId === idHit || i.customId === idStand),
  });

  collector.on("collect", async (btn) => {
    if (btn.customId === idHit) {
      player.push(draw(shoe));
      const total = handTotal(player);
      if (total > 21) {
        collector.stop("bust");
        await btn.deferUpdate();
        await finalize(
          "loss",
          false,
          `you drew ${cardLabel(player[player.length - 1])} and busted (${total})`,
          message
        );
        return;
      }

      const embed = buildTableEmbed({
        playerName: characterName,
        wagerDisplay,
        playerCards: player,
        dealerCards: dealer,
        hideHole: true,
        statusLine: `You drew — **${total}**. Hit or stand?`,
        displayCurrency,
        nativeCc: cc,
        rates,
      });
      await btn.update({ embeds: [embed], components: [row] });
      return;
    }

    if (btn.customId === idStand) {
      collector.stop("stand");
      await btn.deferUpdate();
      runDealer();
      const pScore = handTotal(player);
      const dScore = handTotal(dealer);

      if (dScore > 21) {
        await finalize("win", false, `dealer busts (${dScore}); your ${pScore} wins`, message);
      } else if (pScore > dScore) {
        await finalize("win", false, `${pScore} beats ${dScore}`, message);
      } else if (pScore < dScore) {
        await finalize("loss", false, `${dScore} beats ${pScore}`, message);
      } else {
        await finalize("push", false, `both score ${pScore}`, message);
      }
    }
  });

  collector.on("end", async (_, reason) => {
    if (reason === "bust" || reason === "stand") return;
    try {
      await message.edit({ components: [] });
    } catch {
      /* message may be gone */
    }
    if (!finalized) {
      await finalize("loss", false, "time ran out — hand forfeited", message);
    }
  });
}