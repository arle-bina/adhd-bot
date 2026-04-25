import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { getCorporationList, getBonds, ApiError, type CorporationListItem } from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";
import { formatCurrency, formatSharePrice, convertCurrency, fetchForexRates, CURRENCY_CHOICES } from "../utils/currency.js";

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
  )
  .addStringOption((o) =>
    o
      .setName("currency")
      .setDescription("Display currency (default: USD)")
      .setRequired(false)
      .addChoices(...CURRENCY_CHOICES)
  );

export const cooldown = 5;

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const corp = interaction.options.getString("corp") ?? undefined;
  const page = interaction.options.getInteger("page") ?? 1;
  const targetCurrency = interaction.options.getString("currency") || "USD";

  try {
    const [res, rates] = await Promise.all([
      getBonds({ corp, page }),
      fetchForexRates(),
    ]);

    if (!res.found || !res.bonds || res.bonds.length === 0) {
      await interaction.editReply({ content: "No active bonds found." });
      return;
    }

    const { bonds, filterCorp, totalOutstandingDebt, pagination } = res;

    // Each bond has its own currencyCode (e.g. JPY, GBP, USD).
    // totalOutstandingDebt is in anchor currency (₳ = USD) since it normalizes across currencies.
    const cvtFromAnchor = (n: number) => convertCurrency(n, "USD", targetCurrency, rates);
    const cvtFromBond = (n: number, cc: string | null) => convertCurrency(n, cc || "USD", targetCurrency, rates);
    const fmt = (n: number) => formatCurrency(Math.round(n), targetCurrency);
    const fmtS = (n: number) => formatSharePrice(n, targetCurrency);

    const description = bonds
      .map((b) => {
        const name = b.corporationName ?? "Unknown";
        const maturity = b.maturityLabel ?? "?";
        const coupon = (b.couponRate ?? 0).toFixed(1);
        const price = fmtS(cvtFromBond(b.marketPrice, b.currencyCode));
        const ytm = `${(b.yieldToMaturity ?? 0).toFixed(1)}%`;
        const issued = fmt(cvtFromBond(b.totalIssued, b.currencyCode));
        const turns = b.turnsRemaining ?? 0;
        const holders = b.holders ?? 0;
        const defaultPrefix = b.defaulted ? "⚠️ DEFAULTED — " : "";

        const titleLine = `**[${name} ${maturity} @ ${coupon}%](${b.bondUrl})**`;
        const detailLine = `${defaultPrefix}Price: ${price} · YTM: ${ytm} · ${issued} issued · ${turns} turns left · ${holders} holders`;

        return `${titleLine}\n${detailLine}`;
      })
      .join("\n\n")
      .slice(0, 4096);

    const color = bonds[0]?.brandColor
      ? hexToInt(bonds[0].brandColor)
      : 0x3b82f6;

    const title = filterCorp
      ? `Bonds — ${filterCorp}`
      : "Bond Market";

    // Footer with forex info
    const footerParts: string[] = [`Page ${pagination.page}/${pagination.totalPages}`, `${pagination.totalCount} active bonds`];
    if (targetCurrency !== "USD" && rates[targetCurrency] && rates[targetCurrency] !== 1) {
      const sym = { USD: "$", GBP: "£", JPY: "¥", CAD: "C$", EUR: "€" }[targetCurrency] ?? targetCurrency;
      const rateVal = targetCurrency === "JPY" ? rates[targetCurrency].toFixed(2) : rates[targetCurrency].toFixed(4);
      footerParts.push(`1 INT = ${sym}${rateVal} ${targetCurrency}`);
    }
    footerParts.push("Total debt is anchor-normalized (USD)");
    footerParts.push("ahousedividedgame.com");

    const totalDebtDisplay = fmt(cvtFromAnchor(totalOutstandingDebt));

    const embed = new EmbedBuilder()
      .setTitle(title.slice(0, 256))
      .setColor(color)
      .setDescription(description)
      .addFields({
        name: "Total Outstanding",
        value: totalDebtDisplay,
        inline: true,
      })
      .setFooter({ text: footerParts.join(" · ") });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const msg = "Bot configuration error — contact an admin.";
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