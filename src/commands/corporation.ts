import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import {
  getCorporationList,
  getCorporation,
  ApiError,
  type CorporationListItem,
} from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";

// ---------------------------------------------------------------------------
// Corporation list cache (5-minute TTL)
// ---------------------------------------------------------------------------

let cachedList: CorporationListItem[] = [];
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getList(): Promise<CorporationListItem[]> {
  if (Date.now() < cacheExpiry && cachedList.length > 0) return cachedList;
  const res = await getCorporationList();
  cachedList = res.corporations;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedList;
}

// ---------------------------------------------------------------------------
// Currency / number formatting helpers
// ---------------------------------------------------------------------------

function currency(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function incomePrefix(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${currency(Math.abs(n))}`;
}

// ---------------------------------------------------------------------------
// Autocomplete handler
// ---------------------------------------------------------------------------

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  try {
    const list = await getList();
    const filtered = list
      .filter((c) => c.name.toLowerCase().includes(focused))
      .slice(0, 25);
    await interaction.respond(
      filtered.map((c) => ({ name: c.name, value: c.name }))
    );
  } catch {
    await interaction.respond([]);
  }
}

// ---------------------------------------------------------------------------
// Slash command definition
// ---------------------------------------------------------------------------

export const data = new SlashCommandBuilder()
  .setName("corporation")
  .setDescription("Look up a corporation by name")
  .addStringOption((o) =>
    o
      .setName("name")
      .setDescription("Corporation name")
      .setRequired(true)
      .setAutocomplete(true)
  );

export const cooldown = 5;

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const name = interaction.options.getString("name", true);

  try {
    const res = await getCorporation(name);

    if (!res.found || !res.corporation) {
      await interaction.editReply({
        content: "Corporation not found.",
      });
      return;
    }

    const corp = res.corporation;

    const embed = new EmbedBuilder()
      .setTitle(`🏢 ${corp.name}`.slice(0, 256))
      .setURL(corp.corpUrl)
      .setColor(hexToInt(corp.brandColor) || 0x3b82f6)
      .setFooter({ text: "ahousedividedgame.com" });

    if (corp.logoUrl) embed.setThumbnail(corp.logoUrl);
    if (corp.description) embed.setDescription(corp.description.slice(0, 4096));

    const ceoValue = corp.ceoName && corp.ceoProfileUrl
      ? `[${corp.ceoName}](${corp.ceoProfileUrl})`
      : "None";

    embed.addFields(
      { name: "Type", value: corp.typeLabel, inline: true },
      { name: "HQ", value: corp.headquartersStateName, inline: true },
      { name: "CEO", value: ceoValue, inline: true },
      { name: "Liquid Capital", value: currency(corp.liquidCapital), inline: true },
      { name: "Share Price", value: `$${corp.sharePrice.toFixed(2)}`, inline: true },
      { name: "Market Cap", value: currency(corp.marketCap), inline: true },
      { name: "Daily Revenue", value: currency(corp.dailyRevenue), inline: true },
      { name: "Daily Costs", value: currency(corp.dailyCosts), inline: true },
      { name: "Daily Income", value: incomePrefix(corp.dailyIncome), inline: true },
      {
        name: "Marketing",
        value: `Budget: ${currency(corp.marketingBudget)} · Strength: ${corp.marketingStrength}`,
        inline: false,
      },
    );

    // Sectors
    if (corp.sectors.length > 0) {
      const maxShow = 5;
      const lines = corp.sectors.slice(0, maxShow).map(
        (s) =>
          `${s.stateName} — ${currency(s.revenue)} rev · ${s.growthRate}% growth · ${s.workers} workers`
      );
      if (corp.sectors.length > maxShow) {
        lines.push(`…and ${corp.sectors.length - maxShow} more`);
      }
      embed.addFields({
        name: `Sectors (${corp.sectors.length})`,
        value: lines.join("\n").slice(0, 1024),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const msg = "Bot configuration error — please contact an admin.";
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: msg });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
      return;
    }
    await replyWithError(interaction, "corporation", error);
  }
}
