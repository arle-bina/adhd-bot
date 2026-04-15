import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { getCorporationList, getBonds, ApiError, type CorporationListItem } from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";
import { currencyFor, formatCurrency, formatSharePrice } from "../utils/currency.js";

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
  .setName("bonds")
  .setDescription("Browse active bonds on the market")
  .addStringOption((o) =>
    o
      .setName("corp")
      .setDescription("Filter by corporation")
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addIntegerOption((o) =>
    o
      .setName("page")
      .setDescription("Page number")
      .setRequired(false)
      .setMinValue(1)
  );

export const cooldown = 5;

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const corp = interaction.options.getString("corp") ?? undefined;
  const page = interaction.options.getInteger("page") ?? 1;

  try {
    const res = await getBonds({ corp, page });

    if (!res.found || !res.bonds || res.bonds.length === 0) {
      await interaction.editReply({ content: "No active bonds found." });
      return;
    }

    const { bonds, filterCorp, totalOutstandingDebt, pagination } = res;

    const description = bonds
      .map((b) => {
        const name = b.corporationName ?? "Unknown";
        const maturity = b.maturityLabel ?? "?";
        const coupon = (b.couponRate ?? 0).toFixed(1);
        const bondCc = currencyFor(b.countryId);
        const price = formatSharePrice(b.marketPrice, bondCc);
        const ytm = `${(b.yieldToMaturity ?? 0).toFixed(1)}%`;
        const issued = formatCurrency(b.totalIssued, bondCc);
        const turns = b.turnsRemaining ?? 0;
        const holders = b.holders ?? 0;
        const defaultPrefix = b.defaulted ? "\u26a0\ufe0f DEFAULTED \u2014 " : "";

        const titleLine = `**[${name} ${maturity} @ ${coupon}%](${b.bondUrl})**`;
        const detailLine = `${defaultPrefix}Price: ${price} \u00b7 YTM: ${ytm} \u00b7 ${issued} issued \u00b7 ${turns} turns left \u00b7 ${holders} holders`;

        return `${titleLine}\n${detailLine}`;
      })
      .join("\n\n")
      .slice(0, 4096);

    const color = bonds[0]?.brandColor
      ? hexToInt(bonds[0].brandColor)
      : 0x3b82f6;

    const title = filterCorp
      ? `Bonds \u2014 ${filterCorp}`
      : "Bond Market";

    const embed = new EmbedBuilder()
      .setTitle(title.slice(0, 256))
      .setColor(color)
      .setDescription(description)
      .addFields({
        name: "Total Outstanding",
        value: formatCurrency(totalOutstandingDebt, currencyFor(bonds[0]?.countryId)),
        inline: true,
      })
      .setFooter({
        text: `Page ${pagination.page}/${pagination.totalPages} \u00b7 ${pagination.totalCount} active bonds \u00b7 ahousedividedgame.com`,
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const msg = "Bot configuration error \u2014 contact an admin.";
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: msg });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
      return;
    }
    await replyWithError(interaction, "bonds", error);
  }
}
