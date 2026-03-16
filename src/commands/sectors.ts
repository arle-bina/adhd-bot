import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getSectors, ApiError } from "../utils/api.js";
import { replyWithError } from "../utils/helpers.js";

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("sectors")
  .setDescription("Show sector data by industry type")
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

function currency(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const type = interaction.options.getString("type", true);
  const unowned = interaction.options.getBoolean("unowned") ?? false;
  const page = interaction.options.getInteger("page") ?? 1;

  try {
    const res = await getSectors({ type, unowned, page });

    if (!res.found) {
      const msg = unowned
        ? `No unowned market remaining for ${res.sectorLabel}.`
        : `No owned sectors found for ${res.sectorLabel}.`;
      await interaction.editReply({ content: msg });
      return;
    }

    const embed = new EmbedBuilder();

    if (res.mode === "unowned") {
      embed
        .setTitle(`🏭 ${res.sectorLabel} — Unowned Market`)
        .setColor(0x57f287);

      const lines = res.sectors.map((s, i) => {
        const rank = (res.page - 1) * 10 + i + 1;
        return `${rank}. **${s.stateName}** — ${currency(s.unownedRevenue)} unowned (of ${currency(s.totalMarket)} total)`;
      });

      embed.setDescription(lines.join("\n").slice(0, 4096));
      embed.setFooter({
        text: `Page ${res.page}/${res.totalPages} · ${res.totalItems} states with unowned market · ahousedividedgame.com`,
      });
    } else {
      embed
        .setTitle(`🏭 ${res.sectorLabel} Sectors`)
        .setColor(0x3b82f6);

      const lines = res.sectors.map((s, i) => {
        const rank = (res.page - 1) * 10 + i + 1;
        return `${rank}. **${s.corporationName}** — ${s.stateName} · ${currency(s.revenue)} rev · ${s.growthRate}% growth · ${s.workers} workers`;
      });

      embed.setDescription(lines.join("\n").slice(0, 4096));
      embed.setFooter({
        text: `Page ${res.page}/${res.totalPages} · ${res.totalItems} total sectors · ahousedividedgame.com`,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await interaction.editReply({
        content: "Bot configuration error — please contact an admin.",
      });
      return;
    }
    await replyWithError(interaction, "sectors", error);
  }
}
