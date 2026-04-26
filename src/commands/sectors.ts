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
import { replyWithError } from "../utils/helpers.js";
import {
  formatCurrency,
  fetchForexRates,
  convertCurrency,
  currencyFor,
  CURRENCY_CHOICES,
} from "../utils/currency.js";

export const cooldown = 10;

function gameSiteOrigin(): string {
  try {
    return new URL(process.env.GAME_API_URL!).origin;
  } catch {
    return "https://www.ahousedividedgame.com";
  }
}

/** Keep path/query from API URLs but use the configured game origin (API may use a stale NEXT_PUBLIC_BASE_URL). */
function normalizeGamePageUrl(href: string): string {
  try {
    const u = new URL(href);
    return new URL(u.pathname + u.search + u.hash, gameSiteOrigin()).href;
  } catch {
    return href;
  }
}

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
        { name: "Logistics", value: "logistics" },
        { name: "Extraction", value: "extraction" },
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
  )
  .addStringOption((option) =>
    option
      .setName("currency")
      .setDescription("Display currency (default: USD)")
      .setRequired(false)
      .addChoices(...CURRENCY_CHOICES)
  );

function buildOwnedEmbed(result: OwnedSectorsResponse, targetCurrency: string, rates: Record<string, number>): EmbedBuilder {
  const lines = result.sectors.map((sector, index) => {
    const rank = (result.page - 1) * 10 + index + 1;
    const sectorHref = normalizeGamePageUrl(sector.sectorUrl);
    // Sector revenue is in the corp's local currency (liquidCurrencyCode).
    // Convert from that currency to the user's chosen display currency.
    const sourceCurrency = sector.liquidCurrencyCode ?? currencyFor(sector.countryId);
    const rev = convertCurrency(sector.revenue, sourceCurrency, targetCurrency, rates);
    return `${rank}. [**${sector.corporationName}** — ${sector.stateName}](${sectorHref}) · ${formatCurrency(rev, targetCurrency)} rev · ${sector.growthRate.toFixed(1)}% growth · ${sector.workers.toLocaleString()} workers`;
  });

  return new EmbedBuilder()
    .setTitle(`🏭 ${result.sectorLabel} Sectors`)
    .setColor(0x3b82f6)
    .setDescription(lines.join("\n").slice(0, 4096))
    .setFooter({
      text: `Page ${result.page}/${result.totalPages} · ${result.totalItems} total sectors · Values in ${targetCurrency} · ahousedividedgame.com`,
    });
}

function buildUnownedEmbed(result: UnownedSectorsResponse, targetCurrency: string, rates: Record<string, number>): EmbedBuilder {
  const lines = result.sectors.map((sector, index) => {
    const rank = (result.page - 1) * 10 + index + 1;
    const stateHref = new URL(`/state/${encodeURIComponent(sector.stateId)}`, gameSiteOrigin()).href;
    // All market amounts are in anchor currency (₳ = USD).
    const unowned = convertCurrency(sector.unownedRevenue, "USD", targetCurrency, rates);
    const total = convertCurrency(sector.totalMarket, "USD", targetCurrency, rates);
    return `${rank}. [**${sector.stateName}**](${stateHref}) — ${formatCurrency(unowned, targetCurrency)} unowned (of ${formatCurrency(total, targetCurrency)} total)`;
  });

  return new EmbedBuilder()
    .setTitle(`🏭 ${result.sectorLabel} — Unowned Market`)
    .setColor(0x57f287)
    .setDescription(lines.join("\n").slice(0, 4096))
    .setFooter({
      text: `Page ${result.page}/${result.totalPages} · ${result.totalItems} states with unowned market · Values in ${targetCurrency} · ahousedividedgame.com`,
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
  const targetCurrency = interaction.options.getString("currency") || "USD";

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

    const rates = await fetchForexRates();

    const buildEmbed = () =>
      result.mode === "unowned"
        ? buildUnownedEmbed(result as UnownedSectorsResponse, targetCurrency, rates)
        : buildOwnedEmbed(result as OwnedSectorsResponse, targetCurrency, rates);

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
