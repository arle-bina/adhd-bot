import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { playCraps } from "../utils/api-casino.js";
import { baseEmbed } from "../utils/embeds.js";
import { CASINO_COLORS, limitsLine, outcomeColor, replyCasinoError, settlementLines, sleep, stakeOption } from "../utils/casino.js";

export const cooldown = 3;

const DIE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
/** Rolls shown in the result; long point runs are elided in the middle. */
const SHOWN_ROLLS = 12;

export const data = new SlashCommandBuilder()
  .setName("craps")
  .setDescription("Bet the pass or don't pass line and roll to a result")
  .addStringOption((opt) =>
    opt
      .setName("bet")
      .setDescription("Which line to bet")
      .setRequired(true)
      .addChoices(
        { name: "Pass line: win on 7/11, then make the point", value: "pass" },
        { name: "Don't pass: win on 2/3, then a 7 before the point", value: "dontpass" },
      ),
  )
  .addIntegerOption((opt) => stakeOption(opt));

function rollLine([a, b]: [number, number]): string {
  return `${DIE[a]}${DIE[b]} **${a + b}**`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const bet = interaction.options.getString("bet", true) as "pass" | "dontpass";
  const stake = interaction.options.getInteger("stake", true);
  await interaction.deferReply();
  try {
    const result = await playCraps(interaction.user.id, stake, bet);
    const { rolls, point, result: verdict } = result.outcome;
    await interaction.editReply({
      embeds: [baseEmbed({ title: "🎲 Craps", description: `Come-out roll: ${rollLine(rolls[0])}`, color: CASINO_COLORS.table })],
    });
    await sleep(1200);

    const shown =
      rolls.length <= SHOWN_ROLLS
        ? rolls.map(rollLine)
        : [...rolls.slice(0, 6).map(rollLine), `_${rolls.length - 11} more rolls_`, ...rolls.slice(-5).map(rollLine)];
    const verdictLine =
      verdict === "push" ? "**Push.** Your stake comes back." : verdict === "win" ? "**You win.**" : "**House wins.**";
    const embed = baseEmbed({
      title: `🎲 Craps · ${result.characterName}`,
      description:
        `${bet === "pass" ? "Pass line" : "Don't pass"}${point ? ` · point **${point}**` : ""}\n` +
        `${shown.join("\n")}\n\n${verdictLine}\n\n${settlementLines(result)}`,
      color: outcomeColor(result.net),
      footer: limitsLine(result.limits),
    });
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyCasinoError(interaction, "craps", error);
  }
}
