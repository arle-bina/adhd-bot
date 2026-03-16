import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getSectors, SectorType } from "../utils/api.js";
import { replyWithError } from "../utils/helpers.js";

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

export async function execute(interaction: ChatInputCommandInteraction) {
  const type = interaction.options.getString("type", true) as SectorType;
  const unowned = interaction.options.getBoolean("unowned") ?? false;
  const page = interaction.options.getInteger("page") ?? 1;

  await interaction.deferReply();

  try {
    const result = await getSectors({ type, unowned, page });

    if (!result.found || result.sectors.length === 0) {
      const message =
        result.mode === "unowned"
          ? `No unowned market remaining for ${result.sectorLabel}.`
          : `No owned sectors found for ${result.sectorLabel}.`;
      await interaction.editReply({ content: message });
      return;
    }

    if (result.mode === "unowned") {
      const lines = result.sectors.map((sector, index) => {
        const rank = (result.page - 1) * 10 + index + 1;
        return `${rank}. **${sector.stateName}** — $${sector.unownedRevenue.toLocaleString()} unowned (of $${sector.totalMarket.toLocaleString()} total)`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`🏭 ${result.sectorLabel} — Unowned Market`)
        .setColor(0x57f287)
        .setDescription(lines.join("\n"))
        .setFooter({
          text: `Page ${result.page}/${result.totalPages} · ${result.totalItems} states with unowned market · ahousedivided.com`,
        });

      await interaction.editReply({ embeds: [embed] });
    } else {
      const lines = result.sectors.map((sector, index) => {
        const rank = (result.page - 1) * 10 + index + 1;
        return `${rank}. **${sector.corporationName}** — ${sector.stateName} · $${sector.revenue.toLocaleString()} rev · ${sector.growthRate}% growth · ${sector.workers.toLocaleString()} workers`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`🏭 ${result.sectorLabel} Sectors`)
        .setColor(0x3b82f6)
        .setDescription(lines.join("\n"))
        .setFooter({
          text: `Page ${result.page}/${result.totalPages} · ${result.totalItems} total sectors · ahousedivided.com`,
        });

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    await replyWithError(interaction, "sectors", error);
  }
}
