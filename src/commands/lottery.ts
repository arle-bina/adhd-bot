import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { casinoRoundAction, createCasinoRound, listCasinoRounds } from "../utils/api-casino.js";
import { baseEmbed } from "../utils/embeds.js";
import { money, replyCasinoError } from "../utils/casino.js";
import { LOTTERY_TIER_LABEL, lotteryEmbed } from "../utils/casinoRounds.js";

export const cooldown = 3;

const TIER_CHOICES = [
  { name: "Low rollers (50,000 INT a ticket)", value: "low" },
  { name: "High rollers (1,000,000 INT a ticket)", value: "high" },
];

export const data = new SlashCommandBuilder()
  .setName("lottery")
  .setDescription("Buy lottery tickets or check the current draws")
  .addSubcommand((sub) =>
    sub
      .setName("buy")
      .setDescription("Buy tickets in the next draw")
      .addStringOption((opt) => opt.setName("tier").setDescription("Which draw").setRequired(true).addChoices(...TIER_CHOICES))
      .addIntegerOption((opt) =>
        opt.setName("tickets").setDescription("How many tickets (1 to 100 per draw)").setMinValue(1).setMaxValue(100),
      ),
  )
  .addSubcommand((sub) => sub.setName("status").setDescription("Show the open draws and your tickets"));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand(true);
  const discordId = interaction.user.id;

  if (sub === "status") {
    await interaction.deferReply();
    try {
      const { rounds } = await listCasinoRounds({ game: "lottery", status: "open" });
      if (rounds.length === 0) {
        await interaction.editReply({
          embeds: [baseEmbed({ title: "🎟️ Lottery", description: "No draw is open. The first ticket bought opens one: `/lottery buy`." })],
        });
        return;
      }
      await interaction.editReply({ embeds: rounds.slice(0, 2).map((r) => lotteryEmbed(r, discordId)) });
    } catch (error) {
      await replyCasinoError(interaction, "lottery", error);
    }
    return;
  }

  const tier = interaction.options.getString("tier", true) as "low" | "high";
  const tickets = interaction.options.getInteger("tickets") ?? 1;
  await interaction.deferReply();
  try {
    const { round } = await createCasinoRound({ game: "lottery", discordId, tier, channelId: interaction.channelId });
    const entered = await casinoRoundAction(round.roundId, { action: "enter", discordId, tickets });
    await interaction.editReply({
      content: `🎟️ ${tickets} ${LOTTERY_TIER_LABEL[tier].toLowerCase()} ticket(s) for ${money(entered.stake ?? 0, entered.currency ?? "")}. The winner is announced in this channel.`,
      embeds: [lotteryEmbed(entered.round, discordId)],
    });
  } catch (error) {
    await replyCasinoError(interaction, "lottery", error);
  }
}
