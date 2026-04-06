import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getElections, getAutocomplete, type Election } from "../utils/api.js";
import { replyWithError, standardFooter } from "../utils/helpers.js";

export function formatElectionType(type: string): string {
  const map: Record<string, string> = {
    senate: "Senate",
    house: "House",
    stateSenate: "State Senate",
    governor: "Governor",
    president: "Presidential",
    commons: "Commons",
    primeMinister: "Prime Minister",
  };
  return map[type] ?? type;
}

const PAGE_SIZE = 5;

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("elections")
  .setDescription("Show active and upcoming elections")
  .addStringOption((option) =>
    option
      .setName("country")
      .setDescription("Filter by country")
      .setRequired(false)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" }
      )
  )
  .addStringOption((option) =>
    option
      .setName("state")
      .setDescription("Filter by state/region code (e.g. CA, TX)")
      .setRequired(false)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  try {
    const res = await getAutocomplete({ type: "states", q: focused, limit: 25 });
    await interaction.respond(
      res.results.map((r) => ({ name: r.name, value: r.id }))
    );
  } catch {
    await interaction.respond([]);
  }
}

function buildElectionsEmbed(
  elections: Election[],
  page: number,
  totalPages: number,
): EmbedBuilder {
  const start = page * PAGE_SIZE;
  const shown = elections.slice(start, start + PAGE_SIZE);

  const lines = shown.map((e) => {
    const typeLabel = formatElectionType(e.electionType);
    const candidateList =
      e.candidates
        .map((c) => {
          const name = c.profileUrl ? `[${c.characterName}](${c.profileUrl})` : c.characterName;
          return `${name} (${c.party})`;
        })
        .join(", ") || "No candidates yet";
    const timeStr = e.endTime
      ? `<t:${Math.floor(new Date(e.endTime).getTime() / 1000)}:R>`
      : "TBD";
    return `**[${typeLabel}] -- ${e.state}** (${e.status})\nCandidates: ${candidateList}\nEnds: ${timeStr}`;
  });

  const description = lines.join("\n\n") + "\n\n-# Use `/election` to drill into a specific race";

  const pageInfo = totalPages > 1 ? `Page ${page + 1} of ${totalPages}` : undefined;

  return new EmbedBuilder()
    .setTitle("Active & Upcoming Elections")
    .setColor(0x5865f2)
    .setDescription(description.slice(0, 4096))
    .setFooter(standardFooter(pageInfo));
}

function buildNavRow(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("elections_prev")
      .setLabel("Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId("elections_next")
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const country = interaction.options.getString("country") ?? undefined;
  const state = interaction.options.getString("state") ?? undefined;

  await interaction.deferReply();

  try {
    const result = await getElections({ country, state });

    if (!result.found || result.elections.length === 0) {
      await interaction.editReply({ content: "No active or upcoming elections found." });
      return;
    }

    const elections = result.elections;
    const totalPages = Math.ceil(elections.length / PAGE_SIZE);
    let page = 0;

    if (totalPages <= 1) {
      await interaction.editReply({ embeds: [buildElectionsEmbed(elections, 0, 1)] });
      return;
    }

    const message = await interaction.editReply({
      embeds: [buildElectionsEmbed(elections, page, totalPages)],
      components: [buildNavRow(page, totalPages)],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: "Use `/elections` yourself to browse.", ephemeral: true });
        return;
      }
      await btn.deferUpdate();
      if (btn.customId === "elections_prev") page = Math.max(0, page - 1);
      if (btn.customId === "elections_next") page = Math.min(totalPages - 1, page + 1);
      await btn.editReply({
        embeds: [buildElectionsEmbed(elections, page, totalPages)],
        components: [buildNavRow(page, totalPages)],
      });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  } catch (error) {
    await replyWithError(interaction, "elections", error);
  }
}
