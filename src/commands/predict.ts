import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getPrediction, PredictionPartyEntry, ApiError } from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";

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

function normalizeColor(color: string): string {
  return color.startsWith("#") ? color : `#${color}`;
}

function buildParliamentChartUrl(entries: PredictionPartyEntry[]): string {
  const chartData = entries.map((e) => ({
    value: e.seats,
    color: normalizeColor(e.partyColor),
    label: `${e.partyName} (${e.seats})`,
  }));

  const config = {
    type: "parliament",
    data: {
      datasets: [{ data: chartData }],
    },
  };

  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&w=500&h=280&bkg=transparent`;
}

function buildSeatsText(entries: PredictionPartyEntry[]): string {
  return entries.map((e) => `**${e.partyName}** — ${e.seats}`).join("\n") || "None";
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const country = interaction.options.getString("country", true);
  const race = interaction.options.getString("race", true);

  await interaction.deferReply();

  try {
    const result = await getPrediction({ country, race });

    const metaParts: string[] = [];
    if (result.cycle != null) metaParts.push(`Cycle ${result.cycle}`);
    if (race === "senate" && result.activeSenateClass != null) {
      metaParts.push(`Class ${result.activeSenateClass}`);
    }
    metaParts.push(`${result.totalSeats} seats total`);
    const metaLine = metaParts.join(" · ");

    const showProjected = result.inGeneral && result.projected.length > 0;
    const primaryEntries = showProjected ? result.projected : result.current;
    const embedColor = primaryEntries.length > 0
      ? hexToInt(primaryEntries[0].partyColor)
      : hexToInt(null);

    // Page 1: predicted (or current if no election running) + parliament chart
    const page1Title = showProjected
      ? `📊 ${result.chamberName} — Predicted Seats`
      : `📊 ${result.chamberName} — Current Seats`;

    const page1Desc = showProjected
      ? buildSeatsText(result.projected)
      : `_No general elections active._\n\n${buildSeatsText(result.current)}`;

    const page1 = new EmbedBuilder()
      .setTitle(page1Title)
      .setColor(embedColor)
      .setDescription(page1Desc)
      .setImage(buildParliamentChartUrl(primaryEntries))
      .setFooter({ text: `${metaLine} · ahousedividedgame.com` });

    if (!showProjected) {
      await interaction.editReply({ embeds: [page1] });
      return;
    }

    // Page 2: current seats
    const currentColor = result.current.length > 0
      ? hexToInt(result.current[0].partyColor)
      : hexToInt(null);

    const page2 = new EmbedBuilder()
      .setTitle(`📊 ${result.chamberName} — Current Seats`)
      .setColor(currentColor)
      .setDescription(buildSeatsText(result.current))
      .setImage(buildParliamentChartUrl(result.current))
      .setFooter({ text: `${metaLine} · ahousedividedgame.com` });

    const pages = [page1, page2];

    function buildRow(activePage: number): ActionRowBuilder<ButtonBuilder> {
      return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("predict_projected")
          .setLabel("Predicted")
          .setStyle(activePage === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(activePage === 0),
        new ButtonBuilder()
          .setCustomId("predict_current")
          .setLabel("Current")
          .setStyle(activePage === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(activePage === 1),
      );
    }

    let currentPage = 0;
    const message = await interaction.editReply({
      embeds: [pages[0]],
      components: [buildRow(0)],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: "Use your own /predict command.", ephemeral: true });
        return;
      }
      await btn.deferUpdate();
      currentPage = btn.customId === "predict_projected" ? 0 : 1;
      await btn.editReply({
        embeds: [pages[currentPage]],
        components: [buildRow(currentPage)],
      });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });

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
