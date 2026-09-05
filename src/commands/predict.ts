import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from "discord.js";
import { getPrediction, PredictionPartyEntry, ApiError } from "../utils/api.js";
import { replyWithError } from "../utils/helpers.js";
import { respondCountryAutocomplete, validateCountry } from "../utils/countryChoices.js";
import { renderChamber, brandColor, type ChamberShape } from "../utils/viz/index.js";
import { chartAttachment } from "../utils/viz/attach.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("predict")
  .setDescription("Show seat predictions for a legislative chamber")
  .addStringOption((option) =>
    option
      .setName("country")
      .setDescription("Country to predict")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((option) =>
    option
      .setName("race")
      .setDescription("Legislative chamber")
      .setRequired(true)
      .addChoices(
        // Shared chamber values cover multiple countries; the server validates
        // the (country, race) pair, so one choice per chamber type — not per
        // country — avoids duplicate Discord choice values.
        { name: "Senate (US/BR/NG)", value: "senate" },
        { name: "House (US/NG)", value: "house" },
        { name: "Commons (UK)", value: "commons" },
        { name: "Shūgiin (JP)", value: "shugiin" },
        { name: "Sangiin (JP)", value: "sangiin" },
        { name: "Bundestag (DE)", value: "bundestag" },
        { name: "Dáil (IE)", value: "dail" },
        { name: "Chamber (BR)", value: "chamber" },
        { name: "NPC (CN)", value: "npcDelegate" },
        // RU is bicameral with a contested upper chamber; DD is unicameral.
        // Values are officeType keys, matching validRaces() on the server.
        { name: "Soviet of the Union (USSR)", value: "supremeSovietDeputy" },
        { name: "Soviet of Nationalities (USSR)", value: "nationalitiesDeputy" },
        { name: "Volkskammer (East Germany)", value: "volkskammerDeputy" },
      )
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await respondCountryAutocomplete(interaction);
}

/**
 * Hemicycle, one dot per seat.
 *
 * Replaces a QuickChart half-doughnut. Besides the form being wrong for a seat
 * count, the old config never arrived intact: `datalabels.display` and
 * `formatter` were function values, and `JSON.stringify` drops functions, so
 * the "hide labels under 6%" rule never once applied in production.
 */
/**
 * Chamber shape by race.
 *
 * The Commons is a horseshoe with facing benches, not a hemicycle — the two
 * forms encode different politics and are not interchangeable. Everything else
 * the game models seats in an arch.
 */
const CHAMBER_SHAPE: Record<string, ChamberShape> = {
  commons: "westminster",
};

async function buildChart(
  entries: PredictionPartyEntry[],
  totalSeats: number,
  title: string,
  subtitle: string,
  race: string,
): Promise<Buffer> {
  const majority = Math.floor(totalSeats / 2) + 1;
  return renderChamber({
    shape: CHAMBER_SHAPE[race] ?? "arch",
    title,
    subtitle: `${totalSeats} seats · ${majority} for a majority${subtitle ? ` · ${subtitle}` : ""}`,
    footerLeft: "Projected from current standing",
    totalSeats,
    majority,
    parties: entries.map((e, i) => ({
      name: e.partyName,
      seats: e.seats,
      color: brandColor(e.partyColor, i),
    })),
  });
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

  /*
   * Autocomplete does not constrain submitted values the way choices did, so
   * re-check here. Runs AFTER deferReply: a cold country cache makes an HTTP
   * call (60s client timeout) and Discord kills an un-acknowledged interaction
   * after 3s.
   */
  const check = await validateCountry(country);
  if (!check.ok) {
    await interaction.editReply({ content: check.message });
    return;
  }

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
      const chart = chartAttachment(
        await buildChart(chartEntries, totalSeats, `${result.chamberName} — current seats`, "", race),
        "seats",
        race,
      );
      const majorityLabel = buildMajorityLabel(result.current, totalSeats, race);

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${result.chamberName} — Current Seats`)
        .setColor(embedColor)
        .setDescription(`_No general elections active._\n\n${majorityLabel}\n\n${buildSeatsColumn(result.current)}`)
        .setImage(chart.url)
        .setFooter({ text: `${metaLine} · ahousedividedgame.com` });

      await interaction.editReply({ embeds: [embed], files: [chart.file] });
      return;
    }

    // Show both current and projected side by side
    const projectedLabel = buildMajorityLabel(result.projected, totalSeats, race);
    const currentLabel = buildMajorityLabel(result.current, totalSeats, race);

    // Don't add an "Other" bucket — show the actual projected breakdown only
    const chart = chartAttachment(
      await buildChart(result.projected, totalSeats, `${result.chamberName} — projection`, `${projectedSum} allocated`, race),
      "projection",
      race,
    );

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
      .setImage(chart.url)
      .setFooter({ text: `Projection based on current vote tallies · updates each turn · ${metaLine} · ahousedividedgame.com` });

    await interaction.editReply({ embeds: [embed], files: [chart.file] });

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
