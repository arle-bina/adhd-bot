import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getSectors, SectorType, OwnedSectorsResponse, UnownedSectorsResponse } from "../utils/api.js";
import { replyWithError, normalizeGameUrl } from "../utils/helpers.js";

export const cooldown = 10;

export const data = new SlashCommandBuilder()
  .setName("sectors")
  .setDescription("View sector data by industry type")
  .addStringOption((option) =>
    option
      .setName("type")
      .setDescription("Industry type")
      .setRequired(true)
      .addChoices(
        { name: "Financial", value: "financial" },
        { name: "Media", value: "media" },
        { name: "Manufacturing", value: "manufacturing" },
        { name: "Healthcare", value: "healthcare" },
        { name: "Retail", value: "retail" },
        { name: "Automobiles", value: "automobiles" },
        { name: "Technology", value: "technology" },
        { name: "Energy", value: "energy" },
        { name: "Agriculture", value: "agriculture" },
        { name: "Real Estate", value: "real_estate" },
        { name: "Defense", value: "defense" },
        { name: "Telecommunications", value: "telecommunications" },
        { name: "Entertainment", value: "entertainment" },
      )
  )
  .addBooleanOption((option) =>
    option
      .setName("unowned")
      .setDescription("Show unowned market instead (default: false)")
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName("page")
      .setDescription("Page number (default: 1)")
      .setRequired(false)
      .setMinValue(1)
  );

function buildOwnedEmbed(result: OwnedSectorsResponse): EmbedBuilder {
  const lines = result.sectors.map((sector, index) => {
    const rank = (result.page - 1) * 10 + index + 1;
    const sectorHref = normalizeGameUrl(sector.sectorUrl);
    return `${rank}. [**${sector.corporationName}** — ${sector.stateName}](${sectorHref}) · $${sector.revenue.toLocaleString()} rev · ${sector.growthRate.toFixed(1)}% growth · ${sector.workers.toLocaleString()} workers`;
  });

  return new EmbedBuilder()
    .setTitle(`🏭 ${result.sectorLabel} Sectors`)
    .setColor(0x3b82f6)
    .setDescription(lines.join("\n").slice(0, 4096))
    .setFooter({
      text: `Page ${result.page}/${result.totalPages} · ${result.totalItems} total sectors · ahousedividedgame.com`,
    });
}

function buildUnownedEmbed(result: UnownedSectorsResponse): EmbedBuilder {
  const lines = result.sectors.map((sector, index) => {
    const rank = (result.page - 1) * 10 + index + 1;
    const stateHref = normalizeGameUrl(`/state/${encodeURIComponent(sector.stateId)}`);
    return `${rank}. [**${sector.stateName}**](${stateHref}) — $${sector.unownedRevenue.toLocaleString()} unowned (of $${sector.totalMarket.toLocaleString()} total)`;
  });

  return new EmbedBuilder()
    .setTitle(`🏭 ${result.sectorLabel} — Unowned Market`)
    .setColor(0x57f287)
    .setDescription(lines.join("\n").slice(0, 4096))
    .setFooter({
      text: `Page ${result.page}/${result.totalPages} · ${result.totalItems} states with unowned market · ahousedividedgame.com`,
    });
}

function buildNavRow(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("sectors_prev")
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId("sectors_next")
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const type = interaction.options.getString("type", true) as SectorType;
  const unowned = interaction.options.getBoolean("unowned") ?? false;
  let page = interaction.options.getInteger("page") ?? 1;

  await interaction.deferReply();

  try {
    let result = await getSectors({ type, unowned, page });

    if (!result.found || result.sectors.length === 0) {
      const message =
        result.mode === "unowned"
          ? `No unowned market remaining for ${result.sectorLabel}.`
          : `No owned sectors found for ${result.sectorLabel}.`;
      await interaction.editReply({ content: message });
      return;
    }

    const buildEmbed = () =>
      result.mode === "unowned"
        ? buildUnownedEmbed(result as UnownedSectorsResponse)
        : buildOwnedEmbed(result as OwnedSectorsResponse);

    const totalPages = result.totalPages;

    if (totalPages <= 1) {
      await interaction.editReply({ embeds: [buildEmbed()] });
      return;
    }

    const message = await interaction.editReply({
      embeds: [buildEmbed()],
      components: [buildNavRow(page, totalPages)],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: "Use `/sectors` yourself to browse.", ephemeral: true });
        return;
      }

      await btn.deferUpdate();

      if (btn.customId === "sectors_prev") page = Math.max(1, page - 1);
      if (btn.customId === "sectors_next") page = Math.min(totalPages, page + 1);

      try {
        result = await getSectors({ type, unowned, page });
        await btn.editReply({
          embeds: [buildEmbed()],
          components: [buildNavRow(page, totalPages)],
        });
      } catch (error) {
        await replyWithError(interaction, "sectors", error);
      }
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  } catch (error) {
    await replyWithError(interaction, "sectors", error);
  }
}
