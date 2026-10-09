import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { playSlots, type SlotSymbol } from "../utils/api-casino.js";
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

const SYMBOL_EMOJI: Record<SlotSymbol, string> = {
  CHERRY: "🍒",
  LEMON: "🍋",
  ORANGE: "🍊",
  GRAPE: "🍇",
  BELL: "🔔",
  STAR: "⭐",
  SEVEN: "7️⃣",
  DIAMOND: "💎",
  WILD: "🃏",
};
const SPIN_FRAMES = ["🎰 🎰 🎰", "🍒 🔔 💎", "⭐ 🍋 7️⃣"];

export const data = new SlashCommandBuilder()
  .setName("slots")
  .setDescription("Spin the slot machine with your character's cash")
  .addIntegerOption((opt) => stakeOption(opt));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const stake = interaction.options.getInteger("stake", true);
  await interaction.deferReply();
  try {
    const result = await playSlots(interaction.user.id, stake);
    for (const frame of SPIN_FRAMES) {
      await interaction.editReply({
        embeds: [baseEmbed({ title: "🎰 Slots", description: `# ${frame}\nSpinning...`, color: CASINO_COLORS.table })],
      });
      await sleep(450);
    }
    const reels = result.outcome.reels.map((s) => SYMBOL_EMOJI[s]).join(" ");
    const headline =
      result.outcome.kind === "none"
        ? "No line."
        : `**${result.outcome.name}** pays ${multiplierLabel(result.multiplier)}${result.outcome.jackpot ? " 🎉" : ""}`;
    const embed = baseEmbed({
      title: `🎰 Slots · ${result.characterName}`,
      description: `# ${reels}\n${headline}\n\n${settlementLines(result)}`,
      color: outcomeColor(result.net),
      footer: limitsLine(result.limits),
    });
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyCasinoError(interaction, "slots", error);
  }
}
