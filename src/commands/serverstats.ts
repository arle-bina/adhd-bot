import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getStats } from "../utils/statsStore.js";
import { renderTimeSeries, compactNumber } from "../utils/viz/index.js";
import { chartAttachment } from "../utils/viz/attach.js";

export const cooldown = 10;

export const data = new SlashCommandBuilder()
  .setName("serverstats")
  .setDescription("View server statistics over time")
  .addStringOption((opt) =>
    opt
      .setName("type")
      .setDescription("What stats to display")
      .setRequired(true)
      .addChoices(
        { name: "Messages", value: "messages" },
        { name: "Members", value: "members" },
      ),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("days")
      .setDescription("Time frame in days (default: 30)")
      .setMinValue(1)
      .setMaxValue(365),
  )
  .addBooleanOption((opt) =>
    opt
      .setName("daily")
      .setDescription("Show per-day view instead of over-time trend (default: false)"),
  );

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * All four server-stats views are the same chart with different data, so they
 * share one renderer rather than four near-identical Chart.js configs.
 */
function statsChart(
  guildName: string,
  dates: string[],
  values: number[],
  opts: { metric: string; subtitle: string; footerLeft: string; diverging?: boolean },
): Buffer {
  return renderTimeSeries({
    title: `${guildName} — ${opts.metric}`,
    subtitle: opts.subtitle,
    footerLeft: opts.footerLeft,
    labels: dates.map(formatDate),
    series: [{ name: opts.metric, values }],
    valueFormat: "number",
    fill: !opts.diverging,
    directional: Boolean(opts.diverging),
    zeroBaseline: Boolean(opts.diverging),
  });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const type = interaction.options.getString("type", true);
  const days = interaction.options.getInteger("days") ?? 30;
  const daily = interaction.options.getBoolean("daily") ?? false;

  const stats = getStats(interaction.guild.id, days);

  if (stats.length === 0) {
    await interaction.editReply({
      content: `No stats recorded yet. Data is collected automatically — check back after the bot has been running for a day.`,
    });
    return;
  }

  const dates = stats.map((s) => s.date);
  const guildName = interaction.guild.name;

  let chartBuffer: Buffer;
  let description: string;

  if (type === "messages") {
    const dailyMessages = stats.map((s) => s.messages);
    const totalMessages = dailyMessages.reduce((a, b) => a + b, 0);
    const avgPerDay = stats.length > 0 ? Math.round(totalMessages / stats.length) : 0;
    const peakDay = stats.reduce((max, s) => (s.messages > max.messages ? s : max), stats[0]);

    chartBuffer = statsChart(guildName, dates, dailyMessages, {
      metric: daily ? "messages per day" : "daily messages",
      subtitle: `Last ${stats.length} day${stats.length !== 1 ? "s" : ""}`,
      footerLeft: `Total ${compactNumber(totalMessages)} · Avg ${compactNumber(avgPerDay)}/day · Peak ${formatDate(peakDay.date)}`,
    });
    description = [
      `**Period:** ${stats.length} day${stats.length !== 1 ? "s" : ""}`,
      `**Total Messages:** ${totalMessages.toLocaleString()}`,
      `**Average/Day:** ${avgPerDay.toLocaleString()}`,
      `**Peak Day:** ${formatDate(peakDay.date)} (${peakDay.messages.toLocaleString()} messages)`,
    ].join("\n");
  } else {
    const memberCounts = stats.map((s) => s.members).filter((m) => m > 0);
    if (memberCounts.length === 0) {
      await interaction.editReply({
        content: "No member count data recorded yet. Check back after the bot has been running.",
      });
      return;
    }

    const filteredStats = stats.filter((s) => s.members > 0);
    const filteredDates = filteredStats.map((s) => s.date);
    const filteredMembers = filteredStats.map((s) => s.members);
    const current = filteredMembers[filteredMembers.length - 1];
    const first = filteredMembers[0];
    const change = current - first;
    const changeStr = change >= 0 ? `+${change}` : `${change}`;

    if (daily) {
      const dailyChange = filteredMembers.map((v, i) => (i === 0 ? 0 : v - filteredMembers[i - 1]));
      const gained = dailyChange.filter((v) => v > 0).reduce((a, b) => a + b, 0);
      const lost = dailyChange.filter((v) => v < 0).reduce((a, b) => a + b, 0);

      chartBuffer = statsChart(guildName, filteredDates, dailyChange, {
        metric: "net members per day",
        subtitle: `Last ${filteredStats.length} day${filteredStats.length !== 1 ? "s" : ""}`,
        footerLeft: `Net ${changeStr} · Gained +${gained} · Lost ${lost}`,
        diverging: true,
      });
      description = [
        `**Period:** ${filteredStats.length} day${filteredStats.length !== 1 ? "s" : ""}`,
        `**Net Change:** ${changeStr}`,
        `**Gained:** +${gained} · **Lost:** ${lost}`,
      ].join("\n");
    } else {
      chartBuffer = statsChart(guildName, filteredDates, filteredMembers, {
        metric: "members",
        subtitle: `Last ${filteredStats.length} day${filteredStats.length !== 1 ? "s" : ""}`,
        footerLeft: `Now ${compactNumber(current)} · Change ${changeStr} · High ${compactNumber(Math.max(...filteredMembers))}`,
      });
      description = [
        `**Period:** ${filteredStats.length} day${filteredStats.length !== 1 ? "s" : ""}`,
        `**Current Members:** ${current.toLocaleString()}`,
        `**Change:** ${changeStr}`,
        `**High:** ${Math.max(...filteredMembers).toLocaleString()} · **Low:** ${Math.min(...filteredMembers).toLocaleString()}`,
      ].join("\n");
    }
  }

  const chart = chartAttachment(chartBuffer, "serverstats", type);

  const embed = new EmbedBuilder()
    .setColor(type === "messages" ? 0x5865f2 : 0xeb459e)
    .setTitle(`Server Stats — ${type === "messages" ? "Messages" : "Members"}`)
    .setDescription(description)
    .setImage(chart.url)
    .setFooter({ text: "ahousedividedgame.com" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], files: [chart.file] });
}
