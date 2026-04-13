import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getPrediction, PredictionPartyEntry, ApiError } from "../utils/api.js";
import { replyWithError } from "../utils/helpers.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("predict")
  .setDescription("Show seat predictions for a legislative chamber")
  .addStringOption((option) =>
    option
      .setName("country")
      .setDescription("Country to predict")
      .setRequired(true)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" },
        { name: "Japan", value: "JP" },
        { name: "Canada", value: "CA" },
        { name: "Germany", value: "DE" },
      )
  )
  .addStringOption((option) =>
    option
      .setName("race")
      .setDescription("Legislative chamber")
      .setRequired(true)
      .addChoices(
        { name: "Senate (US)", value: "senate" },
        { name: "House (US)", value: "house" },
        { name: "Commons (UK/CA)", value: "commons" },
        { name: "Shūgiin (JP)", value: "shugiin" },
        { name: "Sangiin (JP)", value: "sangiin" },
        { name: "Bundestag (DE)", value: "bundestag" },
      )
  );

const FALLBACK_PALETTE = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
  "#42d4f4", "#f032e6", "#bfef45", "#fabed4", "#469990",
  "#dcbeff", "#9A6324", "#fffac8", "#800000", "#aaffc3",
];

function normalizeColor(color: string | null | undefined, index: number): string {
  if (color) return color.startsWith("#") ? color : `#${color}`;
  return FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

async function buildParliamentChartUrl(entries: PredictionPartyEntry[], totalSeats: number): Promise<string> {
  const colors = entries.map((e, i) => normalizeColor(e.partyColor, i));

  const config = {
    type: "doughnut" as const,
    data: {
      labels: entries.map((e) => `${e.partyName} (${e.seats})`),
      datasets: [
        {
          data: entries.map((e) => e.seats),
          backgroundColor: colors,
          borderColor: "#2b2d31",
          borderWidth: 2,
        },
      ],
    },
    options: {
      rotation: -90,
      circumference: 180,
      cutout: "40%",
      layout: { padding: { bottom: 0 } },
      plugins: {
        legend: {
          display: true,
          position: "bottom" as const,
          labels: { color: "#dcddde", font: { size: 11 }, padding: 12, usePointStyle: true, pointStyle: "rectRounded" },
        },
        datalabels: {
          display: (ctx: { dataIndex: number }) => {
            const value = entries[ctx.dataIndex]?.seats ?? 0;
            return value / totalSeats > 0.06;
          },
          color: "#fff",
          font: { weight: "bold" as const, size: 13 },
          formatter: (_: number, ctx: { dataIndex: number }) => entries[ctx.dataIndex]?.seats ?? "",
        },
      },
    },
  };

  const response = await fetch("https://quickchart.io/chart/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chart: config,
      width: 600,
      height: 350,
      backgroundColor: "#2b2d31",
      version: "4",
    }),
  });

  if (response.ok) {
    const body = (await response.json()) as { success: boolean; url: string };
    if (body.success) return body.url;
  }

  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&w=600&h=350&bkg=%232b2d31&v=4`;
}

function addOtherEntry(entries: PredictionPartyEntry[], totalSeats: number): PredictionPartyEntry[] {
  const assignedSeats = entries.reduce((sum, e) => sum + e.seats, 0);
  const remaining = totalSeats - assignedSeats;
  if (remaining <= 0) return entries;
  return [
    ...entries,
    { party: "other", partyName: "Other", partyColor: "#808080", seats: remaining },
  ];
}

function buildMajorityLabel(entries: PredictionPartyEntry[], totalSeats: number, race: string): string {
  const majority = Math.floor(totalSeats / 2) + 1;
  const sorted = [...entries].sort((a, b) => b.seats - a.seats);
  const largest = sorted[0];
  if (!largest) return "";

  if (largest.seats >= majority) {
    return `**${largest.partyName} Majority**`;
  }

  const noMajorityTerm = race === "commons" ? "Hung Parliament" : "No Majority";
  return `**${noMajorityTerm}** (${largest.partyName} Largest Party)`;
}

function buildSeatsColumn(entries: PredictionPartyEntry[]): string {
  if (entries.length === 0) return "_None_";
  return entries.map((e) => `**${e.partyName}** — ${e.seats}`).join("\n");
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const country = interaction.options.getString("country", true);
  const race = interaction.options.getString("race", true);

  await interaction.deferReply();

  try {
    const result = await getPrediction({ country, race });

    const showProjected = result.inGeneral && result.projected.length > 0;

    // totalSeats from API can be 0; fall back to sum of projected or current entries
    const projectedSum = result.projected.reduce((s, e) => s + e.seats, 0);
    const currentSum = result.current.reduce((s, e) => s + e.seats, 0);
    const totalSeats = result.totalSeats || Math.max(projectedSum, currentSum);
    const majority = Math.floor(totalSeats / 2) + 1;
    const metaParts: string[] = [];
    if (result.cycle != null) metaParts.push(`Cycle ${result.cycle}`);
    if (race === "senate" && result.activeSenateClass != null) {
      metaParts.push(`Class ${result.activeSenateClass}`);
    }
    metaParts.push(`${totalSeats} seats total`);
    const metaLine = metaParts.join(" · ");

    const embedColor = 0x2b2d31;

    if (!showProjected) {
      // No active general — just show current composition
      const chartEntries = addOtherEntry(result.current, totalSeats);
      const chartUrl = await buildParliamentChartUrl(chartEntries, totalSeats);
      const majorityLabel = buildMajorityLabel(result.current, totalSeats, race);

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${result.chamberName} — Current Seats`)
        .setColor(embedColor)
        .setDescription(`_No general elections active._\n\n${majorityLabel}\n\n${buildSeatsColumn(result.current)}`)
        .setImage(chartUrl)
        .setFooter({ text: `${metaLine} · ahousedividedgame.com` });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Show both current and projected side by side
    const projectedLabel = buildMajorityLabel(result.projected, totalSeats, race);
    const currentLabel = buildMajorityLabel(result.current, totalSeats, race);

    // Don't add "Other" slice — show the actual projected breakdown only
    const chartUrl = await buildParliamentChartUrl(result.projected, totalSeats);

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${result.chamberName}`)
      .setColor(embedColor)
      .setDescription(`${projectedSum} of ${totalSeats} seats allocated · ${majority} needed for majority`)
      .addFields(
        {
          name: "Projected",
          value: `${projectedLabel}\n\n${buildSeatsColumn(result.projected)}`,
          inline: true,
        },
        {
          name: "Current",
          value: `${currentLabel}\n\n${buildSeatsColumn(result.current)}`,
          inline: true,
        },
      )
      .setImage(chartUrl)
      .setFooter({ text: `Projection based on current vote tallies · updates each turn · ${metaLine} · ahousedividedgame.com` });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 400) {
        let message = "Invalid request — check your inputs.";
        try {
          const body = JSON.parse(error.responseBody);
          if (body.error) message = body.error;
        } catch { /* use default */ }
        await interaction.editReply({ content: message });
        return;
      }
      if (error.status === 401) {
        await interaction.editReply({ content: "Bot configuration error — contact an admin." });
        return;
      }
    }
    if (
      error instanceof TypeError ||
      error instanceof Error && (
        error.name === "TimeoutError" ||
        ("errors" in error && Array.isArray((error as AggregateError).errors))
      )
    ) {
      await interaction.editReply({ content: "Could not reach the game server. Try again shortly." });
      return;
    }
    await replyWithError(interaction, "predict", error);
  }
}
