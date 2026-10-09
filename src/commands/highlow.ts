import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { ApiError } from "../utils/api-base.js";
import { actHighLow, startHighLow, type HighLowSession } from "../utils/api-casino.js";
import { baseEmbed, discordTime } from "../utils/embeds.js";
import {
  CASINO_COLORS,
  followUpCasinoError,
  money,
  multiplierLabel,
  outcomeColor,
  replyCasinoError,
  stakeOption,
} from "../utils/casino.js";

export const cooldown = 3;

const COLLECTOR_MS = 5 * 60_000;
const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export const data = new SlashCommandBuilder()
  .setName("highlow")
  .setDescription("Call higher or lower on the next card and build a multiplier")
  .addIntegerOption((opt) => stakeOption(opt));

function card(rank: number): string {
  return `\`${RANKS[rank]}\``;
}

function buildEmbed(s: HighLowSession, characterName: string) {
  const trail = s.history.map((h) => `${card(h.card)} ${h.guess === "higher" ? "⬆" : "⬇"} ${card(h.next)} ${h.correct ? "✅" : "❌"}`);
  const lines = [`# ${card(s.card)}`, `**Stake:** ${money(s.stake, s.currency)} · **Running:** ${multiplierLabel(s.multiplier)}`];
  if (trail.length > 0) lines.push(trail.slice(-6).join("\n"));

  if (s.status === "active") {
    lines.push(
      s.steps === 0
        ? "Call the next card. Cashing out now returns your stake."
        : `Cash out now for **${money(s.potential, s.currency)}**, or keep going (${s.steps}/${s.maxSteps}).`,
    );
    lines.push(`Idle hands cash out ${discordTime(new Date(s.expiresAt))}.`);
    return baseEmbed({ title: `🃏 High-low · ${characterName}`, description: lines.join("\n\n"), color: CASINO_COLORS.table });
  }
  const paid = s.payout ?? 0;
  const net = paid - s.stake;
  lines.push(
    s.status === "lost"
      ? `**Wrong call.** The house keeps ${money(s.stake, s.currency)}.`
      : `**Cashed out** for ${money(paid, s.currency)} (${net >= 0 ? "+" : "-"}${money(Math.abs(net), s.currency)}).${s.capped ? " This win hit the table's maximum payout." : ""}`,
  );
  return baseEmbed({ title: `🃏 High-low · ${characterName}`, description: lines.join("\n\n"), color: outcomeColor(net) });
}

function buttons(s: HighLowSession, prefix: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}_higher`)
      .setLabel(s.higherMultiplier > 0 ? `Higher ${multiplierLabel(s.higherMultiplier)}` : "Higher")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(s.higherMultiplier === 0),
    new ButtonBuilder()
      .setCustomId(`${prefix}_lower`)
      .setLabel(s.lowerMultiplier > 0 ? `Lower ${multiplierLabel(s.lowerMultiplier)}` : "Lower")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(s.lowerMultiplier === 0),
    new ButtonBuilder()
      .setCustomId(`${prefix}_cashout`)
      .setLabel(s.steps === 0 ? "Take stake back" : "Cash out")
      .setStyle(ButtonStyle.Success),
  );
}

/** A 409 on start carries the hand the player already has open; resume it instead of failing. */
function openSessionFrom(error: unknown): HighLowSession | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  try {
    const body = JSON.parse(error.responseBody) as { session?: HighLowSession };
    return body.session ?? null;
  } catch {
    return null;
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const stake = interaction.options.getInteger("stake", true);
  const discordId = interaction.user.id;
  await interaction.deferReply();

  let session: HighLowSession;
  let resumed = false;
  try {
    session = (await startHighLow(discordId, stake)).session;
  } catch (error) {
    const open = openSessionFrom(error);
    if (!open) {
      await replyCasinoError(interaction, "highlow", error);
      return;
    }
    session = open;
    resumed = true;
  }

  const characterName = interaction.user.displayName;
  const prefix = `hl_${interaction.id}`;
  const message = await interaction.editReply({
    content: resumed ? "You already had a hand open, so here it is." : "",
    embeds: [buildEmbed(session, characterName)],
    components: [buttons(session, prefix)],
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: COLLECTOR_MS,
    filter: (i) => i.user.id === discordId && i.customId.startsWith(prefix),
  });

  collector.on("collect", async (btn) => {
    const action = btn.customId.slice(prefix.length + 1) as "higher" | "lower" | "cashout";
    await btn.deferUpdate();
    try {
      session = (await actHighLow(discordId, session.sessionId, action)).session;
    } catch (error) {
      await followUpCasinoError(btn, error);
      return;
    }
    const done = session.status !== "active";
    await message.edit({
      content: "",
      embeds: [buildEmbed(session, characterName)],
      components: done ? [] : [buttons(session, prefix)],
    });
    if (done) collector.stop("settled");
  });

  collector.on("end", async (_, reason) => {
    if (reason === "settled") return;
    try {
      await message.edit({ components: [] });
    } catch {
      /* message may be gone */
    }
  });
}
