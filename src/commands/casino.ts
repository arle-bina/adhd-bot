import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { getCasinoHouse } from "../utils/api-casino.js";
import { baseEmbed } from "../utils/embeds.js";
import { CASINO_COLORS, money, replyCasinoError } from "../utils/casino.js";

export const cooldown = 5;

/** Long-run return to the player, from the game server's own paytables. */
const GAMES: { game: string; label: string; rtp: string }[] = [
  { game: "blackjack", label: "/blackjack", rtp: "5% taken from each win" },
  { game: "slots", label: "/slots", rtp: "returns 95.4%" },
  { game: "roulette", label: "/roulette", rtp: "returns 97.3%" },
  { game: "crash", label: "/crash", rtp: "returns 96%" },
  { game: "craps", label: "/craps", rtp: "returns 98.6%" },
  { game: "highlow", label: "/highlow", rtp: "returns 96% per call" },
  { game: "race", label: "/race", rtp: "winners share 95% of the pot" },
  { game: "lottery", label: "/lottery", rtp: "one ticket takes 90% of the pot" },
  { game: "poker", label: "/poker", rtp: "winners keep 95% of their profit" },
];

export const data = new SlashCommandBuilder()
  .setName("casino")
  .setDescription("The casino bank, your table limits, and what every game pays back");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  try {
    const house = await getCasinoHouse(interaction.user.id).catch(() => getCasinoHouse());
    const rows = GAMES.map(({ game, label, rtp }) => {
      const played = house.games[game]?.played ?? 0;
      return `**${label}** · ${rtp}${played > 0 ? ` · ${played.toLocaleString("en-US")} played` : ""}`;
    });
    const you = house.player
      ? `\n\n**Your limits (${house.player.currency}):** ${money(house.player.maxStake, house.player.currency)} per stake, ` +
        `${money(house.player.maxPayout, house.player.currency)} per win.` +
        (house.player.highlow ? "\nYou have a `/highlow` hand open." : "")
      : "";
    const embed = baseEmbed({
      title: "🎰 Casino",
      description:
        `**Bank:** ${house.anchorBalance.toLocaleString("en-US")} INT. Table limits: ${house.maxStakeAnchor.toLocaleString("en-US")} INT per stake, ${house.maxPayoutAnchor.toLocaleString("en-US")} INT per win.` +
        `${you}\n\n${rows.join("\n")}`,
      color: CASINO_COLORS.table,
      footer: "Results are drawn by the game server",
    });
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyCasinoError(interaction, "casino", error);
  }
}
