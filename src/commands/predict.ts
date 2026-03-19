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
        { name: "Bundestag (DE)", value: "bundestag" },
      )
  );

function normalizeColor(color: string | null | undefined): string {
  if (!color) return "#808080";
  return color.startsWith("#") ? color : `#${color}`;
}

async function buildParliamentChartUrl(entries: PredictionPartyEntry[]): Promise<string> {
  const config = {
    type: "doughnut",
    data: {
      labels: entries.map((e) => `${e.partyName} (${e.seats})`),
      datasets: [
        {
          data: entries.map((e) => e.seats),
          backgroundColor: entries.map((e) => normalizeColor(e.partyColor)),
          borderWidth: 0,
        },
      ],
    },
    options: {
      rotation: -90,
      circumference: 180,
      plugins: {
        legend: { display: true, position: "bottom" as const },
        datalabels: { display: false },
      },
    },
  };

  const response = await fetch("https://quickchart.io/chart/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chart: config,
      width: 500,
      height: 300,
      backgroundColor: "#36393f",
    }),
  });

  if (response.ok) {
    const body = (await response.json()) as { success: boolean; url: string };
    if (body.success) return body.url;
  }

  // Fallback to GET URL if POST fails
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&w=500&h=300&bkg=%2336393f`;
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

    const totalSeats = result.totalSeats;
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
      const chartUrl = await buildParliamentChartUrl(chartEntries);
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
    const allocatedSeats = result.projected.reduce((sum, e) => sum + e.seats, 0);
    const projectedLabel = buildMajorityLabel(result.projected, totalSeats, race);
    const currentLabel = buildMajorityLabel(result.current, totalSeats, race);

    const chartEntries = addOtherEntry(result.projected, totalSeats);
    const chartUrl = await buildParliamentChartUrl(chartEntries);

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${result.chamberName}`)
      .setColor(embedColor)
      .setDescription(`${allocatedSeats} of ${totalSeats} seats allocated · ${majority} needed for majority`)
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
