import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { playRoulette, type RouletteBet } from "../utils/api-casino.js";
import { baseEmbed } from "../utils/embeds.js";
import { CASINO_COLORS, limitsLine, outcomeColor, replyCasinoError, settlementLines, sleep, stakeOption } from "../utils/casino.js";

export const cooldown = 3;

const BET_CHOICES: { name: string; value: RouletteBet }[] = [
  { name: "Red (pays 2x)", value: "red" },
  { name: "Black (pays 2x)", value: "black" },
  { name: "Odd (pays 2x)", value: "odd" },
  { name: "Even (pays 2x)", value: "even" },
  { name: "Low 1-18 (pays 2x)", value: "low" },
  { name: "High 19-36 (pays 2x)", value: "high" },
  { name: "First dozen 1-12 (pays 3x)", value: "dozen1" },
  { name: "Second dozen 13-24 (pays 3x)", value: "dozen2" },
  { name: "Third dozen 25-36 (pays 3x)", value: "dozen3" },
  { name: "Column 1 (pays 3x)", value: "column1" },
  { name: "Column 2 (pays 3x)", value: "column2" },
  { name: "Column 3 (pays 3x)", value: "column3" },
  { name: "Single number (pays 36x)", value: "straight" },
];

const COLOR_EMOJI = { red: "🔴", black: "⚫", green: "🟢" } as const;

export const data = new SlashCommandBuilder()
  .setName("roulette")
  .setDescription("Bet on a single-zero roulette wheel")
  .addStringOption((opt) =>
    opt.setName("bet").setDescription("What to bet on").setRequired(true).addChoices(...BET_CHOICES),
  )
  .addIntegerOption((opt) => stakeOption(opt))
  .addIntegerOption((opt) =>
    opt.setName("number").setDescription("Your number, for a single-number bet").setMinValue(0).setMaxValue(36),
  );

function betLabel(bet: RouletteBet, number: number | null): string {
  if (bet === "straight") return `number ${number}`;
  return BET_CHOICES.find((c) => c.value === bet)!.name.replace(/ \(pays.*\)$/, "").toLowerCase();
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const bet = interaction.options.getString("bet", true) as RouletteBet;
  const stake = interaction.options.getInteger("stake", true);
  const number = interaction.options.getInteger("number");
  if (bet === "straight" && number === null) {
    await interaction.reply({ content: "Pick a `number` from 0 to 36 for a single-number bet.", ephemeral: true });
    return;
  }
  await interaction.deferReply();
  try {
    const result = await playRoulette(interaction.user.id, stake, bet, number ?? undefined);
    await interaction.editReply({
      embeds: [baseEmbed({ title: "🎡 Roulette", description: `The ball is spinning on **${betLabel(bet, number)}**...`, color: CASINO_COLORS.table })],
    });
    await sleep(1500);
    const { pocket, color, won } = result.outcome;
    const embed = baseEmbed({
      title: `🎡 Roulette · ${result.characterName}`,
      description:
        `# ${COLOR_EMOJI[color]} ${pocket}\n` +
        `You bet on **${betLabel(bet, number)}**. ${won ? "**Winner.**" : "No luck."}\n\n` +
        settlementLines(result),
      color: outcomeColor(result.net),
      footer: limitsLine(result.limits),
    });
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyCasinoError(interaction, "roulette", error);
  }
}
