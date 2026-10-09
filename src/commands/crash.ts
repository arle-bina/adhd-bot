import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { playCrash } from "../utils/api-casino.js";
import { baseEmbed } from "../utils/embeds.js";
import {
  CASINO_COLORS,
  limitsLine,
  multiplierLabel,
  outcomeColor,
  replyCasinoError,
  settlementLines,
  sleep,
  stakeOption,
} from "../utils/casino.js";

export const cooldown = 3;

const ANIMATION_STEPS = 6;

export const data = new SlashCommandBuilder()
  .setName("crash")
  .setDescription("Set a cash-out target and see if the rocket gets there before it crashes")
  .addNumberOption((opt) =>
    opt
      .setName("target")
      .setDescription("Cash out automatically at this multiplier (1.01 to 100)")
      .setRequired(true)
      .setMinValue(1.01)
      .setMaxValue(100),
  )
  .addIntegerOption((opt) => stakeOption(opt));

function curve(value: number, ceiling: number): string {
  const filled = Math.max(1, Math.round((Math.log(value) / Math.log(Math.max(ceiling, 1.01))) * 12));
  return "▰".repeat(Math.min(12, filled)) + "▱".repeat(Math.max(0, 12 - filled));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = Math.floor(interaction.options.getNumber("target", true) * 100) / 100;
  const stake = interaction.options.getInteger("stake", true);
  await interaction.deferReply();
  try {
    const result = await playCrash(interaction.user.id, stake, target);
    const { crashPoint, won } = result.outcome;
    // Climb toward whichever comes first: the target (cash-out) or the crash.
    const stop = won ? target : crashPoint;
    for (let i = 1; i <= ANIMATION_STEPS; i++) {
      const value = 1 + ((stop - 1) * i) / ANIMATION_STEPS;
      await interaction.editReply({
        embeds: [
          baseEmbed({
            title: "🚀 Crash",
            description: `# ${multiplierLabel(value)}\n${curve(value, target)}\nCashing out at **${multiplierLabel(target)}**`,
            color: CASINO_COLORS.table,
          }),
        ],
      });
      await sleep(400);
    }
    const headline = won
      ? `💰 Cashed out at **${multiplierLabel(target)}**. The rocket went on to **${multiplierLabel(crashPoint)}**.`
      : `💥 Crashed at **${multiplierLabel(crashPoint)}**, short of your **${multiplierLabel(target)}**.`;
    const embed = baseEmbed({
      title: `🚀 Crash · ${result.characterName}`,
      description: `${headline}\n\n${settlementLines(result)}`,
      color: outcomeColor(result.net),
      footer: limitsLine(result.limits),
    });
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyCasinoError(interaction, "crash", error);
  }
}
