import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  AttachmentBuilder,
} from "discord.js";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import type { ChartConfiguration } from "chart.js";
import { registerFont } from "canvas";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getStats } from "../utils/statsStore.js";

export const cooldown = 10;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FONT_PATH = join(__dirname, "..", "..", "assets", "DejaVuSans.ttf");

registerFont(FONT_PATH, { family: "DejaVu Sans" });

const chartCanvas = new ChartJSNodeCanvas({
  width: 800,
  height: 400,
  backgroundColour: "#2b2d31",
  chartCallback: (ChartJS) => {
    ChartJS.defaults.font.family = "DejaVu Sans";
  },
});

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

async function renderMessagesChart(
  guildName: string,
  dates: string[],
  dailyMessages: number[],
): Promise<Buffer> {
  // Compute cumulative totals
  const cumulative: number[] = [];
  let total = 0;
  for (const count of dailyMessages) {
    total += count;
    cumulative.push(total);
  }

  const labels = dates.map(formatDate);

  const config: ChartConfiguration = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Messages per Day",
          data: dailyMessages,
          borderColor: "#5865f2",
          backgroundColor: "rgba(88, 101, 242, 0.15)",
          fill: true,
          tension: 0.3,
          pointRadius: dates.length > 60 ? 0 : 3,
          yAxisID: "y",
        },
        {
          label: "Total Messages",
          data: cumulative,
          borderColor: "#57f287",
          backgroundColor: "rgba(87, 242, 135, 0.08)",
          fill: false,
          tension: 0.3,
          pointRadius: dates.length > 60 ? 0 : 3,
          borderDash: [6, 3],
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `${guildName} — Messages`,
          color: "#ffffff",
          font: { size: 16 },
        },
        legend: {
          labels: { color: "#dcddde" },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#8e9297",
            maxTicksLimit: 15,
          },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          type: "linear",
          position: "left",
          title: {
            display: true,
            text: "Messages / Day",
            color: "#5865f2",
          },
          ticks: { color: "#5865f2" },
          grid: { color: "rgba(255,255,255,0.05)" },
          beginAtZero: true,
        },
        y1: {
          type: "linear",
          position: "right",
          title: {
            display: true,
            text: "Cumulative Total",
            color: "#57f287",
          },
          ticks: { color: "#57f287" },
          grid: { drawOnChartArea: false },
          beginAtZero: true,
        },
      },
    },
  };

  return Buffer.from(await chartCanvas.renderToBuffer(config));
}

async function renderDailyMessagesChart(
  guildName: string,
  dates: string[],
  dailyMessages: number[],
): Promise<Buffer> {
  const labels = dates.map(formatDate);

  const config: ChartConfiguration = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Messages",
          data: dailyMessages,
          backgroundColor: "rgba(88, 101, 242, 0.6)",
          borderColor: "#5865f2",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `${guildName} — Daily Messages`,
          color: "#ffffff",
          font: { size: 16 },
        },
        legend: {
          labels: { color: "#dcddde" },
        },
      },
      scales: {
        x: {
          ticks: { color: "#8e9297", maxTicksLimit: 15 },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          ticks: { color: "#8e9297" },
          grid: { color: "rgba(255,255,255,0.05)" },
          beginAtZero: true,
        },
      },
    },
  };

  return Buffer.from(await chartCanvas.renderToBuffer(config));
}

async function renderDailyMembersChart(
  guildName: string,
  dates: string[],
  dailyChange: number[],
): Promise<Buffer> {
  const labels = dates.map(formatDate);

  const colors = dailyChange.map((v) =>
    v >= 0 ? "rgba(87, 242, 135, 0.6)" : "rgba(237, 66, 69, 0.6)",
  );
  const borders = dailyChange.map((v) =>
    v >= 0 ? "#57f287" : "#ed4245",
  );

  const config: ChartConfiguration = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Member Change",
          data: dailyChange,
          backgroundColor: colors,
          borderColor: borders,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `${guildName} — Daily Member Change`,
          color: "#ffffff",
          font: { size: 16 },
        },
        legend: {
          labels: { color: "#dcddde" },
        },
      },
      scales: {
        x: {
          ticks: { color: "#8e9297", maxTicksLimit: 15 },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          ticks: { color: "#8e9297" },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
      },
    },
  };

  return Buffer.from(await chartCanvas.renderToBuffer(config));
}

async function renderMembersChart(
  guildName: string,
  dates: string[],
  members: number[],
): Promise<Buffer> {
  const labels = dates.map(formatDate);

  const config: ChartConfiguration = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Server Members",
          data: members,
          borderColor: "#eb459e",
          backgroundColor: "rgba(235, 69, 158, 0.15)",
          fill: true,
          tension: 0.3,
          pointRadius: dates.length > 60 ? 0 : 3,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `${guildName} — Members`,
          color: "#ffffff",
          font: { size: 16 },
        },
        legend: {
          labels: { color: "#dcddde" },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#8e9297",
            maxTicksLimit: 15,
          },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          ticks: { color: "#8e9297" },
          grid: { color: "rgba(255,255,255,0.05)" },
          beginAtZero: false,
        },
      },
    },
  };

  return Buffer.from(await chartCanvas.renderToBuffer(config));
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

    chartBuffer = daily
      ? await renderDailyMessagesChart(guildName, dates, dailyMessages)
      : await renderMessagesChart(guildName, dates, dailyMessages);
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

      chartBuffer = await renderDailyMembersChart(guildName, filteredDates, dailyChange);
      description = [
        `**Period:** ${filteredStats.length} day${filteredStats.length !== 1 ? "s" : ""}`,
        `**Net Change:** ${changeStr}`,
        `**Gained:** +${gained} · **Lost:** ${lost}`,
      ].join("\n");
    } else {
      chartBuffer = await renderMembersChart(guildName, filteredDates, filteredMembers);
      description = [
        `**Period:** ${filteredStats.length} day${filteredStats.length !== 1 ? "s" : ""}`,
        `**Current Members:** ${current.toLocaleString()}`,
        `**Change:** ${changeStr}`,
        `**High:** ${Math.max(...filteredMembers).toLocaleString()} · **Low:** ${Math.min(...filteredMembers).toLocaleString()}`,
      ].join("\n");
    }
  }

  const attachment = new AttachmentBuilder(chartBuffer, { name: "stats.png" });

  const embed = new EmbedBuilder()
    .setColor(type === "messages" ? 0x5865f2 : 0xeb459e)
    .setTitle(`Server Stats — ${type === "messages" ? "Messages" : "Members"}`)
    .setDescription(description)
    .setImage("attachment://stats.png")
    .setFooter({ text: "ahousedividedgame.com" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], files: [attachment] });
}
