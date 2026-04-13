import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getElections, getTurnStatus } from "../utils/api.js";
import { formatElectionType, RACE_EMOJI } from "../utils/formatting.js";
import { replyWithError } from "../utils/helpers.js";

export const cooldown = 5;

const TURNS_PER_YEAR = 48;

export const data = new SlashCommandBuilder()
  .setName("calendar")
  .setDescription("Show upcoming and active elections with game-clock context")
  .addStringOption((o) =>
    o
      .setName("country")
      .setDescription("Filter by country")
      .setRequired(false)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" },
        { name: "Japan", value: "JP" },
        { name: "Canada", value: "CA" },
        { name: "Germany", value: "DE" }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const country = interaction.options.getString("country") ?? undefined;

  await interaction.deferReply();

  try {
    const [electionsResult, turnStatus] = await Promise.all([
      getElections({ country }),
      getTurnStatus(),
    ]);

    if (!electionsResult.found || electionsResult.elections.length === 0) {
      await interaction.editReply({ content: "No active or upcoming elections found." });
      return;
    }

    const turnInYear = turnStatus.currentTurn % TURNS_PER_YEAR || TURNS_PER_YEAR;
    const nextTs = Math.floor(new Date(turnStatus.nextScheduledTurn).getTime() / 1000);

    // Sort elections by end time, nulls last
    const sorted = [...electionsResult.elections].sort((a, b) => {
      if (!a.endTime && !b.endTime) return 0;
      if (!a.endTime) return 1;
      if (!b.endTime) return -1;
      return new Date(a.endTime).getTime() - new Date(b.endTime).getTime();
    });

    // Group into active vs upcoming
    const active = sorted.filter((e) => e.status === "active");
    const upcoming = sorted.filter((e) => e.status !== "active");

    const lines: string[] = [];

    if (active.length > 0) {
      lines.push("**🟢 Active Elections**");
      for (const e of active.slice(0, 10)) {
        const emoji = RACE_EMOJI[e.electionType] ?? "🗳️";
        const type = formatElectionType(e.electionType);
        const endStr = e.endTime
          ? ` · ends <t:${Math.floor(new Date(e.endTime).getTime() / 1000)}:R>`
          : "";
        const candidateCount = e.candidates.length;
        const candStr = candidateCount > 0 ? ` · ${candidateCount} candidate${candidateCount === 1 ? "" : "s"}` : "";
        lines.push(`${emoji} **${type} — ${e.state}**${endStr}${candStr}`);
      }
      if (active.length > 10) {
        lines.push(`_…and ${active.length - 10} more active_`);
      }
    }

    if (upcoming.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("**⏳ Upcoming Elections**");
      for (const e of upcoming.slice(0, 8)) {
        const emoji = RACE_EMOJI[e.electionType] ?? "🗳️";
        const type = formatElectionType(e.electionType);
        const startStr = e.startTime
          ? ` · starts <t:${Math.floor(new Date(e.startTime).getTime() / 1000)}:R>`
          : "";
        lines.push(`${emoji} **${type} — ${e.state}**${startStr}`);
      }
      if (upcoming.length > 8) {
        lines.push(`_…and ${upcoming.length - 8} more upcoming_`);
      }
    }

    const total = electionsResult.elections.length;
    const footerCountry = country ? ` · ${country}` : "";
    const embed = new EmbedBuilder()
      .setTitle(`📅 Election Calendar${country ? ` — ${country}` : ""}`)
      .setColor(0x5865f2)
      .setDescription(lines.join("\n").slice(0, 4096))
      .addFields(
        { name: "Current Turn", value: String(turnStatus.currentTurn), inline: true },
        { name: "Game Year", value: `Year ${turnStatus.currentYear} (turn ${turnInYear}/${TURNS_PER_YEAR})`, inline: true },
        { name: "Next Turn", value: `<t:${nextTs}:R>`, inline: true },
      )
      .setFooter({
        text: `${total} election${total === 1 ? "" : "s"} total${footerCountry} · ahousedividedgame.com`,
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "calendar", error);
  }
}
