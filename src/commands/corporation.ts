import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import {
  getCorporationList,
  getCorporation,
  getBonds,
  getFinancials,
  ApiError,
  type CorporationListItem,
  type CorporationResponse,
  type BondsResponse,
  type FinancialsResponse,
} from "../utils/api.js";
import { hexToInt, replyWithError } from "../utils/helpers.js";
import { currencyFor, formatCurrency, formatSharePrice, formatCurrencySigned, padCurrency, convertCurrency, fetchForexRates, CURRENCY_CHOICES } from "../utils/currency.js";

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
  .setName("corporation")
  .setDescription("Look up a corporation by name")
  .addStringOption((o) =>
    o
      .setName("name")
      .setDescription("Corporation name")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((o) =>
    o
      .setName("currency")
      .setDescription("Display currency (default: corporation's home currency)")
      .setRequired(false)
      .addChoices(...CURRENCY_CHOICES)
  );

export const cooldown = 5;

// ---------------------------------------------------------------------------
// Button row builder
// ---------------------------------------------------------------------------

type Tab = "overview" | "bonds" | "financials";

function buildTabRow(active: Tab, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("corp_tab_overview")
      .setLabel("Overview")
      .setStyle(active === "overview" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("corp_tab_bonds")
      .setLabel("Bonds")
      .setStyle(active === "bonds" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("corp_tab_financials")
      .setLabel("Financials")
      .setStyle(active === "financials" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

// ---------------------------------------------------------------------------
// Forex footer helper
// ---------------------------------------------------------------------------

function forexFooter(displayCurrency: string, nativeCc: string, rates: Record<string, number>, extra?: string): string {
  const parts: string[] = [];
  if (extra) parts.push(extra);
  if (displayCurrency !== nativeCc) {
    const sym = { USD: "$", GBP: "£", JPY: "¥", CAD: "C$", EUR: "€" }[displayCurrency] ?? displayCurrency;
    const rateVal = displayCurrency === "JPY" ? (rates[displayCurrency] ?? 1).toFixed(2) : (rates[displayCurrency] ?? 1).toFixed(4);
    parts.push(`1 INT = ${sym}${rateVal} ${displayCurrency}`);
  }
  parts.push("ahousedividedgame.com");
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Embed builders
// ---------------------------------------------------------------------------

function buildOverviewEmbed(res: CorporationResponse, displayCurrency: string, rates: Record<string, number>): EmbedBuilder {
  const corp = res.corporation!;
  // Use the API-provided liquidCurrencyCode when available, fall back to country-based mapping.
  const nativeCc = corp.liquidCurrencyCode || currencyFor(corp.countryId);
  const cc = displayCurrency;
  const cvt = (n: number | null | undefined): number | null | undefined => n != null ? Math.round(convertCurrency(n, nativeCc, displayCurrency, rates)) : n;

  const ceo = res.ceo ?? null;
  const financials = res.financials!;
  const sectors = res.sectors ?? [];
  const shareholders = res.shareholders ?? [];
  const creditRating = res.creditRating;
  const bonds = res.bonds ?? [];

  const embed = new EmbedBuilder()
    .setTitle(corp.name.slice(0, 256))
    .setURL(corp.corpUrl)
    .setColor(hexToInt(corp.brandColor) || 0x3b82f6)
    .setFooter({ text: forexFooter(displayCurrency, nativeCc, rates) });

  if (corp.logoUrl) embed.setThumbnail(corp.logoUrl);
  if (corp.description) embed.setDescription(corp.description.slice(0, 4096));

  const ceoValue = ceo
    ? (ceo.profileUrl ? `[${ceo.name}](${ceo.profileUrl})` : ceo.name)
    : "Vacant";

  embed.addFields(
    { name: "Type", value: corp.typeLabel, inline: true },
    { name: "HQ", value: corp.headquartersStateName, inline: true },
    { name: "CEO", value: ceoValue, inline: true },
    { name: "Liquid Capital", value: formatCurrency(cvt(corp.liquidCapital), cc), inline: true },
    { name: "Share Price", value: formatSharePrice(cvt(corp.sharePrice), cc), inline: true },
    { name: "Market Cap", value: formatCurrency(cvt(corp.marketCapitalization), cc), inline: true },
    { name: "Daily Revenue", value: formatCurrency(cvt(financials.totalRevenue), cc), inline: true },
    { name: "Daily Costs", value: formatCurrency(cvt(financials.totalCosts), cc), inline: true },
    { name: "Daily Income", value: formatCurrencySigned(cvt(financials.income), cc), inline: true },
  );

  if ((corp.dividendRate ?? 0) !== 0) {
    embed.addFields({
      name: "Dividends",
      value: `${corp.dividendRate}% · ${formatCurrency(cvt(financials.dailyDividendPayout), cc)}/day`,
      inline: true,
    });
  }

  if (creditRating) {
    embed.addFields({
      name: "Credit Rating",
      value: `${creditRating.rating} (${creditRating.compositeScore ?? 0}/100)`,
      inline: true,
    });
  }

  if (bonds.length > 0) {
    const totalDebt = bonds.reduce((sum, b) => sum + (b.totalIssued ?? 0), 0);
    embed.addFields({
      name: "Debt",
      value: `${formatCurrency(cvt(totalDebt), cc)} (${bonds.length} bond${bonds.length === 1 ? "" : "s"})`,
      inline: true,
    });
  }

  if (shareholders.length > 0) {
    const maxShow = 3;
    const lines = shareholders.slice(0, maxShow).map(
      (s) => `${s.name} — ${(s.shares ?? 0).toLocaleString("en-US")} (${(s.percentage ?? 0).toFixed(1)}%)`
    );
    lines.push(`Public Float — ${(corp.publicFloat ?? 0).toLocaleString("en-US")} (${(corp.publicFloatPct ?? 0).toFixed(1)}%)`);
    if (shareholders.length > maxShow) {
      lines.push(`…and ${shareholders.length - maxShow} more`);
    }
    embed.addFields({
      name: "Shareholders",
      value: lines.join("\n").slice(0, 1024),
      inline: false,
    });
  }

  embed.addFields({
    name: "Marketing",
    value: `Budget: ${formatCurrency(cvt(corp.marketingBudget), cc)} · Strength: ${corp.marketingStrength ?? 0}`,
    inline: false,
  });

  if (sectors.length > 0) {
    const maxShow = 5;
    const lines = sectors.slice(0, maxShow).map(
      (s) =>
        `${s.stateName ?? "Unknown"} — ${formatCurrency(cvt(s.revenue), cc)} rev · ${s.growthRate ?? 0}% growth · ${s.workers ?? 0} workers`
    );
    if (sectors.length > maxShow) {
      lines.push(`…and ${sectors.length - maxShow} more`);
    }
    embed.addFields({
      name: `Sectors (${sectors.length})`,
      value: lines.join("\n").slice(0, 1024),
      inline: false,
    });
  }

  return embed;
}

function buildBondsEmbed(res: BondsResponse, name: string, countryId: string | undefined, displayCurrency: string, rates: Record<string, number>, liquidCurrencyCode: string | null): EmbedBuilder {
  if (!res.bonds || res.bonds.length === 0) {
    return new EmbedBuilder()
      .setTitle(`${name} — Bonds`.slice(0, 256))
      .setColor(0x3b82f6)
      .setDescription(`${name} has no outstanding bonds.`)
      .setFooter({ text: "ahousedividedgame.com" });
  }

  // Each bond has its own currencyCode; totalOutstandingDebt is in anchor (USD).
  const cc = displayCurrency;
  const cvtFromBond = (n: number | null | undefined, bondCc: string | null): number | null | undefined => {
    if (n == null) return n;
    const fromCc = bondCc || liquidCurrencyCode || currencyFor(countryId ?? "us");
    return Math.round(convertCurrency(n, fromCc, displayCurrency, rates));
  };
  const cvtFromAnchor = (n: number | null | undefined): number | null | undefined => n != null ? Math.round(convertCurrency(n, "USD", displayCurrency, rates)) : n;
  const color = hexToInt(res.bonds[0].brandColor) || 0x3b82f6;

  const bondLines = res.bonds.map((b) => {
    const prefix = b.defaulted ? "⚠️ DEFAULTED — " : "";
    const label = `${b.maturityLabel} @ ${(b.couponRate ?? 0).toFixed(1)}%`;
    const url = b.bondUrl ? `[${label}](${b.bondUrl})` : label;
    const details = `Price: ${formatSharePrice(cvtFromBond(b.marketPrice, b.currencyCode), cc)} · YTM: ${(b.yieldToMaturity ?? 0).toFixed(1)}% · ${formatCurrency(cvtFromBond(b.totalIssued, b.currencyCode), cc)} issued · ${b.turnsRemaining ?? 0} turns left`;
    return `${prefix}**${url}**\n${details}`;
  });

  // totalOutstandingDebt is already anchor-normalized by the API.
  const nativeCcForFooter = liquidCurrencyCode || currencyFor(countryId ?? res.bonds[0]?.countryId);

  return new EmbedBuilder()
    .setTitle(`${res.filterCorp ?? name} — Bonds`.slice(0, 256))
    .setColor(color)
    .setDescription(bondLines.join("\n\n").slice(0, 4096))
    .addFields(
      { name: "Total Debt Outstanding", value: formatCurrency(cvtFromAnchor(res.totalOutstandingDebt), cc), inline: true },
      { name: "Active Bonds", value: String(res.bonds.length), inline: true },
    )
    .setFooter({ text: forexFooter(displayCurrency, nativeCcForFooter, rates, "Total debt in USD anchor") });
}

function buildFinancialsEmbed(res: FinancialsResponse, displayCurrency: string, rates: Record<string, number>): EmbedBuilder {
  const corp = res.corporation;
  // API provides liquidCurrencyCode on the corporation object.
  const nativeCc = corp.liquidCurrencyCode || currencyFor(corp.countryId);
  const cc = displayCurrency;
  const cvt = (n: number | null | undefined): number | null | undefined => n != null ? Math.round(convertCurrency(n, nativeCc, displayCurrency, rates)) : n;

  const inc = res.incomeStatement;
  const bal = res.balanceSheet;
  const shares = res.shareStructure;
  const credit = res.creditRating;
  const bonds = res.bonds ?? [];
  const sectors = res.sectorBreakdown ?? [];

  const embed = new EmbedBuilder()
    .setTitle(`Financial Statement — ${corp.name}`.slice(0, 256))
    .setURL(corp.corpUrl)
    .setColor(hexToInt(corp.brandColor) || 0x3b82f6)
    .setFooter({ text: forexFooter(displayCurrency, nativeCc, rates, `${corp.typeLabel} · HQ: ${corp.headquartersStateName}`) });

  if (corp.logoUrl) embed.setThumbnail(corp.logoUrl);

  const W = 14;
  const incomeBlock = [
    padCurrency("Revenue:       ", cvt(inc.totalRevenue), W, cc),
    padCurrency("- Operating:   ", cvt(inc.costs.operatingTotal), W, cc),
    padCurrency("- Interest:    ", cvt(inc.costs.bondInterest), W, cc),
    padCurrency("= Net Income:  ", cvt(inc.netIncome), W, cc),
    padCurrency("Dividends:     ", cvt(inc.dailyDividendPayout), W, cc) + ` (${inc.dividendRate ?? 0}%)`,
    padCurrency("Retained:      ", cvt(inc.retainedEarnings), W, cc),
  ].join("\n");
  embed.addFields({
    name: "Income Statement",
    value: `\`\`\`\n${incomeBlock}\n\`\`\``.slice(0, 1024),
    inline: false,
  });

  const balBlock = [
    padCurrency("Assets:   ", cvt(bal.assets.totalAssets), W, cc),
    padCurrency("  Cash:   ", cvt(bal.assets.cashOnHand), W, cc),
    padCurrency("  NPV:    ", cvt(bal.assets.sectorNPV), W, cc),
    padCurrency("Debt:     ", cvt(bal.liabilities.outstandingDebt), W, cc) + ` (${bal.liabilities.bondCount ?? 0} bond${(bal.liabilities.bondCount ?? 0) === 1 ? "" : "s"})`,
    padCurrency("Equity:   ", cvt(bal.equity.bookValue), W, cc),
  ].join("\n");
  embed.addFields({
    name: "Balance Sheet",
    value: `\`\`\`\n${balBlock}\n\`\`\``.slice(0, 1024),
    inline: false,
  });

  const shareLines: string[] = [
    `Price: ${formatSharePrice(cvt(shares.sharePrice), cc)} · Market Cap: ${formatCurrency(cvt(shares.marketCapitalization), cc)}`,
    `Float: ${(shares.publicFloat ?? 0).toLocaleString("en-US")} (${(shares.publicFloatPct ?? 0).toFixed(1)}%)`,
    "",
  ];
  for (const sh of shares.shareholders ?? []) {
    const valStr = formatCurrency(cvt(sh.value), cc);
    shareLines.push(`${sh.name}     ${(sh.shares ?? 0).toLocaleString("en-US")} (${(sh.percentage ?? 0).toFixed(1)}%)  ${valStr}`);
  }
  embed.addFields({
    name: "Share Structure",
    value: shareLines.join("\n").slice(0, 1024),
    inline: false,
  });

  const comp = credit.components;
  embed.addFields({
    name: "Credit Rating",
    value: `${credit.rating} (${credit.compositeScore ?? 0}/100)\nD/E: ${(comp.debtToEquity ?? 0).toFixed(1)} · IC: ${(comp.interestCoverage ?? 0).toFixed(1)} · Prof: ${(comp.profitability ?? 0).toFixed(1)} · Liq: ${(comp.liquidity ?? 0).toFixed(1)}`.slice(0, 1024),
    inline: true,
  });

  embed.addFields({
    name: "Coupon Rate",
    value: `${(credit.effectiveCouponRate ?? 0).toFixed(1)}% (Prime: ${(credit.primeRate ?? 0).toFixed(1)}%)`,
    inline: true,
  });

  if (bonds.length > 0) {
    const bondLines = bonds.map((b) => {
      const prefix = b.defaulted ? "⚠️ " : "";
      return `${prefix}${b.maturityLabel} @ ${(b.couponRate ?? 0).toFixed(1)}% — ${formatCurrency(cvt(b.totalIssued), cc)} · Price: ${formatSharePrice(cvt(b.marketPrice), cc)} · YTM: ${(b.yieldToMaturity ?? 0).toFixed(1)}%`;
    });
    embed.addFields({
      name: "Outstanding Bonds",
      value: bondLines.join("\n").slice(0, 1024),
      inline: false,
    });
  } else {
    embed.addFields({
      name: "Outstanding Bonds",
      value: "None",
      inline: false,
    });
  }

  if (sectors.length > 0) {
    const maxShow = 5;
    const sorted = [...sectors].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
    const lines = sorted.slice(0, maxShow).map(
      (s) =>
        `${s.stateName ?? "Unknown"} — ${formatCurrency(cvt(s.revenue), cc)} rev · ${(s.effectiveMargin ?? 0).toFixed(1)}% margin · ${formatCurrency(cvt(s.profit), cc)} profit`
    );
    if (sectors.length > maxShow) {
      lines.push(`…and ${sectors.length - maxShow} more`);
    }
    embed.addFields({
      name: "Sector P&L",
      value: lines.join("\n").slice(0, 1024),
      inline: false,
    });
  }

  return embed;
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const name = interaction.options.getString("name", true);
  const explicitCurrency = interaction.options.getString("currency");

  try {
    const [overviewRes, rates] = await Promise.all([
      getCorporation(name),
      fetchForexRates(),
    ]);
    if (!overviewRes.found || !overviewRes.corporation) {
      await interaction.editReply({ content: "Corporation not found." });
      return;
    }

    const displayCurrency = explicitCurrency || currencyFor(overviewRes.corporation.countryId);

    let bondsRes: BondsResponse | null = null;
    let financialsRes: FinancialsResponse | null = null;
    let currentTab: Tab = "overview";

    const message = await interaction.editReply({
      embeds: [buildOverviewEmbed(overviewRes, displayCurrency, rates)],
      components: [buildTabRow("overview")],
    });

    const collector = message.createMessageComponentCollector({ time: 90_000 });

    collector.on("collect", async (component) => {
      if (component.user.id !== interaction.user.id) {
        await component.reply({ content: "This isn't your command.", ephemeral: true });
        return;
      }

      if (!component.isButton() || !component.customId.startsWith("corp_tab_")) return;

      const tab = component.customId.replace("corp_tab_", "") as Tab;
      if (tab === currentTab) {
        await component.deferUpdate();
        return;
      }

      await component.deferUpdate();

      try {
        let embed: EmbedBuilder;

        switch (tab) {
          case "overview":
            embed = buildOverviewEmbed(overviewRes, displayCurrency, rates);
            break;
          case "bonds":
            if (!bondsRes) bondsRes = await getBonds({ corp: name });
            embed = buildBondsEmbed(bondsRes, name, overviewRes.corporation?.countryId, displayCurrency, rates, overviewRes.corporation?.liquidCurrencyCode ?? null);
            break;
          case "financials":
            if (!financialsRes) {
              financialsRes = await getFinancials(name);
              if (!financialsRes.found) {
                await component.editReply({ content: "Could not load financials." });
                return;
              }
            }
            embed = buildFinancialsEmbed(financialsRes, displayCurrency, rates);
            break;
          default:
            return;
        }

        currentTab = tab;
        await component.editReply({
          embeds: [embed],
          components: [buildTabRow(tab)],
        });
      } catch {
        await component.editReply({ content: "Failed to load tab data." });
      }
    });

    collector.on("end", async () => {
      await interaction
        .editReply({ components: [buildTabRow(currentTab, true)] })
        .catch(() => {});
    });
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
    await replyWithError(interaction, "corporation", error);
  }
}