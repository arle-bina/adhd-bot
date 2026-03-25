import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getMarketShare, SectorType, MarketShareResponse } from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";

export const cooldown = 10;

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  UK: "United Kingdom",
  CA: "Canada",
  DE: "Germany",
};

export const data = new SlashCommandBuilder()
  .setName("marketshare")
  .setDescription("View market share by sector")
  .addStringOption((option) =>
    option
      .setName("sector")
      .setDescription("Industry sector")
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
  .addStringOption((option) =>
    option
      .setName("country")
      .setDescription("Filter by country")
      .setRequired(false)
      .addChoices(
        { name: "United States", value: "US" },
        { name: "United Kingdom", value: "UK" },
        { name: "Canada", value: "CA" },
        { name: "Germany", value: "DE" },
      )
  )
  .addStringOption((option) =>
    option
      .setName("state")
      .setDescription("State ID (e.g. US_CA, UK_ENG)")
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName("page")
      .setDescription("Page number (default: 1)")
      .setRequired(false)
      .setMinValue(1)
  );

function buildScopeLabel(result: MarketShareResponse): string {
  if (result.scope.stateName) return result.scope.stateName;
  if (result.scope.country) return COUNTRY_NAMES[result.scope.country] ?? result.scope.country;
  return "Global";
}

function buildEmbed(result: MarketShareResponse): EmbedBuilder {
  const scopeLabel = buildScopeLabel(result);
  const title = `${result.sectorLabel} — ${scopeLabel}`;

  const embedColor =
    result.companies.length > 0 && result.companies[0].brandColor
      ? hexToInt(result.companies[0].brandColor)
      : 0x2b2d31;

  const embed = new EmbedBuilder()
    .setTitle(title.slice(0, 256))
    .setColor(embedColor);

  if (result.companies.length === 0) {
    embed.setDescription("No corporations in this market yet.");
  } else {
    const lines = result.companies.map((c, i) => {
      const rank = (result.page - 1) * result.pageSize + i + 1;
      const tag = c.isNatcorp ? " · NatCorp" : "";
      return `${rank}. **${c.corporationName}** — ${c.marketSharePercent.toFixed(2)}% · $${c.revenue.toLocaleString()}${tag}`;
    });
    embed.setDescription(lines.join("\n").slice(0, 4096));
  }

  const footerParts: string[] = [];
  if (result.totalPages > 1) {
    footerParts.push(`Page ${result.page}/${result.totalPages}`);
  }
  footerParts.push(`Unowned: ${result.unownedPercent.toFixed(2)}%`);
  if (result.totalMarket > 0) {
    footerParts.push(`TAM: $${result.totalMarket.toLocaleString()}`);
  }
  footerParts.push("ahousedividedgame.com");
  embed.setFooter({ text: footerParts.join(" · ") });

  return embed;
}

function buildNavRow(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("marketshare_prev")
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId("marketshare_next")
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const type = interaction.options.getString("sector", true) as SectorType;
  const country = interaction.options.getString("country") ?? undefined;
  const state = interaction.options.getString("state") ?? undefined;
  let page = interaction.options.getInteger("page") ?? 1;

  await interaction.deferReply();

  try {
    let result = await getMarketShare({ type, country, state, page });

    if (!result.found) {
      await interaction.editReply({ content: "Could not retrieve market share data for that query." });
      return;
    }

    const totalPages = result.totalPages;

    if (totalPages <= 1) {
      await interaction.editReply({ embeds: [buildEmbed(result)] });
      return;
    }

    const message = await interaction.editReply({
      embeds: [buildEmbed(result)],
      components: [buildNavRow(page, totalPages)],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: "Use `/marketshare` yourself to browse.", ephemeral: true });
        return;
      }

      await btn.deferUpdate();

      if (btn.customId === "marketshare_prev") page = Math.max(1, page - 1);
      if (btn.customId === "marketshare_next") page = Math.min(totalPages, page + 1);

      try {
        result = await getMarketShare({ type, country, state, page });
        await btn.editReply({
          embeds: [buildEmbed(result)],
          components: [buildNavRow(page, totalPages)],
        });
      } catch (error) {
        await replyWithError(interaction, "marketshare", error);
      }
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  } catch (error) {
    await replyWithError(interaction, "marketshare", error);
  }
}
