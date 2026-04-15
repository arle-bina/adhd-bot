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
import { currencyFor, formatCurrency, formatSharePrice, formatCurrencySigned, padCurrency } from "../utils/currency.js";

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
// Embed builders (return EmbedBuilder, don't edit the reply)
// ---------------------------------------------------------------------------

function buildOverviewEmbed(res: CorporationResponse): EmbedBuilder {
  const corp = res.corporation!;
  const cc = currencyFor(corp.countryId);
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
    .setFooter({ text: "ahousedividedgame.com" });

  if (corp.logoUrl) embed.setThumbnail(corp.logoUrl);
  if (corp.description) embed.setDescription(corp.description.slice(0, 4096));

  const ceoValue = ceo
    ? (ceo.profileUrl ? `[${ceo.name}](${ceo.profileUrl})` : ceo.name)
    : "Vacant";

  embed.addFields(
    { name: "Type", value: corp.typeLabel, inline: true },
    { name: "HQ", value: corp.headquartersStateName, inline: true },
    { name: "CEO", value: ceoValue, inline: true },
    { name: "Liquid Capital", value: formatCurrency(corp.liquidCapital, cc), inline: true },
    { name: "Share Price", value: formatSharePrice(corp.sharePrice, cc), inline: true },
    { name: "Market Cap", value: formatCurrency(corp.marketCapitalization, cc), inline: true },
    { name: "Daily Revenue", value: formatCurrency(financials.totalRevenue, cc), inline: true },
    { name: "Daily Costs", value: formatCurrency(financials.totalCosts, cc), inline: true },
    { name: "Daily Income", value: formatCurrencySigned(financials.income, cc), inline: true },
  );

  if ((corp.dividendRate ?? 0) !== 0) {
    embed.addFields({
      name: "Dividends",
      value: `${corp.dividendRate}% \u00b7 ${formatCurrency(financials.dailyDividendPayout, cc)}/day`,
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
      value: `${formatCurrency(totalDebt, cc)} (${bonds.length} bond${bonds.length === 1 ? "" : "s"})`,
      inline: true,
    });
  }

  if (shareholders.length > 0) {
    const maxShow = 3;
    const lines = shareholders.slice(0, maxShow).map(
      (s) => `${s.name} \u2014 ${(s.shares ?? 0).toLocaleString("en-US")} (${(s.percentage ?? 0).toFixed(1)}%)`
    );
    lines.push(`Public Float \u2014 ${(corp.publicFloat ?? 0).toLocaleString("en-US")} (${(corp.publicFloatPct ?? 0).toFixed(1)}%)`);
    if (shareholders.length > maxShow) {
      lines.push(`\u2026and ${shareholders.length - maxShow} more`);
    }
    embed.addFields({
      name: "Shareholders",
      value: lines.join("\n").slice(0, 1024),
      inline: false,
    });
  }

  embed.addFields({
    name: "Marketing",
    value: `Budget: ${formatCurrency(corp.marketingBudget, cc)} \u00b7 Strength: ${corp.marketingStrength ?? 0}`,
    inline: false,
  });

  if (sectors.length > 0) {
    const maxShow = 5;
    const lines = sectors.slice(0, maxShow).map(
      (s) =>
        `${s.stateName ?? "Unknown"} \u2014 ${formatCurrency(s.revenue, cc)} rev \u00b7 ${s.growthRate ?? 0}% growth \u00b7 ${s.workers ?? 0} workers`
    );
    if (sectors.length > maxShow) {
      lines.push(`\u2026and ${sectors.length - maxShow} more`);
    }
    embed.addFields({
      name: `Sectors (${sectors.length})`,
      value: lines.join("\n").slice(0, 1024),
      inline: false,
    });
  }

  return embed;
}

function buildBondsEmbed(res: BondsResponse, name: string): EmbedBuilder {
  if (!res.bonds || res.bonds.length === 0) {
    return new EmbedBuilder()
      .setTitle(`${name} \u2014 Bonds`.slice(0, 256))
      .setColor(0x3b82f6)
      .setDescription(`${name} has no outstanding bonds.`)
      .setFooter({ text: "ahousedividedgame.com" });
  }

  const cc = res.bonds.length > 0 && res.bonds[0].countryId ? currencyFor(res.bonds[0].countryId) : "USD";
  const color = hexToInt(res.bonds[0].brandColor) || 0x3b82f6;

  const bondLines = res.bonds.map((b) => {
    const prefix = b.defaulted ? "\u26a0\ufe0f DEFAULTED \u2014 " : "";
    const label = `${b.maturityLabel} @ ${(b.couponRate ?? 0).toFixed(1)}%`;
    const url = b.bondUrl ? `[${label}](${b.bondUrl})` : label;
    const details = `Price: ${formatSharePrice(b.marketPrice, cc)} \u00b7 YTM: ${(b.yieldToMaturity ?? 0).toFixed(1)}% \u00b7 ${formatCurrency(b.totalIssued, cc)} issued \u00b7 ${b.turnsRemaining ?? 0} turns left`;
    return `${prefix}**${url}**\n${details}`;
  });

  return new EmbedBuilder()
    .setTitle(`${res.filterCorp ?? name} \u2014 Bonds`.slice(0, 256))
    .setColor(color)
    .setDescription(bondLines.join("\n\n").slice(0, 4096))
    .addFields(
      { name: "Total Debt Outstanding", value: formatCurrency(res.totalOutstandingDebt, cc), inline: true },
      { name: "Active Bonds", value: String(res.bonds.length), inline: true },
    )
    .setFooter({ text: "ahousedividedgame.com" });
}

function buildFinancialsEmbed(res: FinancialsResponse): EmbedBuilder {
  const corp = res.corporation;
  const cc = currencyFor(corp.countryId);
  const inc = res.incomeStatement;
  const bal = res.balanceSheet;
  const shares = res.shareStructure;
  const credit = res.creditRating;
  const bonds = res.bonds ?? [];
  const sectors = res.sectorBreakdown ?? [];

  const embed = new EmbedBuilder()
    .setTitle(`Financial Statement \u2014 ${corp.name}`.slice(0, 256))
    .setURL(corp.corpUrl)
    .setColor(hexToInt(corp.brandColor) || 0x3b82f6)
    .setFooter({ text: `ahousedividedgame.com \u00b7 ${corp.typeLabel} \u00b7 HQ: ${corp.headquartersStateName}` });

  if (corp.logoUrl) embed.setThumbnail(corp.logoUrl);

  const W = 14;
  const incomeBlock = [
    padCurrency("Revenue:       ", inc.totalRevenue, W, cc),
    padCurrency("- Operating:   ", inc.costs.operatingTotal, W, cc),
    padCurrency("- Interest:    ", inc.costs.bondInterest, W, cc),
    padCurrency("= Net Income:  ", inc.netIncome, W, cc),
    padCurrency("Dividends:     ", inc.dailyDividendPayout, W, cc) + ` (${inc.dividendRate ?? 0}%)`,
    padCurrency("Retained:      ", inc.retainedEarnings, W, cc),
  ].join("\n");
  embed.addFields({
    name: "Income Statement",
    value: `\`\`\`\n${incomeBlock}\n\`\`\``.slice(0, 1024),
    inline: false,
  });

  const balBlock = [
    padCurrency("Assets:   ", bal.assets.totalAssets, W, cc),
    padCurrency("  Cash:   ", bal.assets.cashOnHand, W, cc),
    padCurrency("  NPV:    ", bal.assets.sectorNPV, W, cc),
    padCurrency("Debt:     ", bal.liabilities.outstandingDebt, W, cc) + ` (${bal.liabilities.bondCount ?? 0} bond${(bal.liabilities.bondCount ?? 0) === 1 ? "" : "s"})`,
    padCurrency("Equity:   ", bal.equity.bookValue, W, cc),
  ].join("\n");
  embed.addFields({
    name: "Balance Sheet",
    value: `\`\`\`\n${balBlock}\n\`\`\``.slice(0, 1024),
    inline: false,
  });

  const shareLines: string[] = [
    `Price: ${formatSharePrice(shares.sharePrice, cc)} \u00b7 Market Cap: ${formatCurrency(shares.marketCapitalization, cc)}`,
    `Float: ${(shares.publicFloat ?? 0).toLocaleString("en-US")} (${(shares.publicFloatPct ?? 0).toFixed(1)}%)`,
    "",
  ];
  for (const sh of shares.shareholders ?? []) {
    const valStr = formatCurrency(sh.value, cc);
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
    value: `${credit.rating} (${credit.compositeScore ?? 0}/100)\nD/E: ${(comp.debtToEquity ?? 0).toFixed(1)} \u00b7 IC: ${(comp.interestCoverage ?? 0).toFixed(1)} \u00b7 Prof: ${(comp.profitability ?? 0).toFixed(1)} \u00b7 Liq: ${(comp.liquidity ?? 0).toFixed(1)}`.slice(0, 1024),
    inline: true,
  });

  embed.addFields({
    name: "Coupon Rate",
    value: `${(credit.effectiveCouponRate ?? 0).toFixed(1)}% (Prime: ${(credit.primeRate ?? 0).toFixed(1)}%)`,
    inline: true,
  });

  if (bonds.length > 0) {
    const bondLines = bonds.map((b) => {
      const prefix = b.defaulted ? "\u26a0\ufe0f " : "";
      return `${prefix}${b.maturityLabel} @ ${(b.couponRate ?? 0).toFixed(1)}% \u2014 ${formatCurrency(b.totalIssued, cc)} \u00b7 Price: ${formatSharePrice(b.marketPrice, cc)} \u00b7 YTM: ${(b.yieldToMaturity ?? 0).toFixed(1)}%`;
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
        `${s.stateName ?? "Unknown"} \u2014 ${formatCurrency(s.revenue, cc)} rev \u00b7 ${(s.effectiveMargin ?? 0).toFixed(1)}% margin \u00b7 ${formatCurrency(s.profit, cc)} profit`
    );
    if (sectors.length > maxShow) {
      lines.push(`\u2026and ${sectors.length - maxShow} more`);
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

  try {
    // Fetch overview on initial load
    const overviewRes = await getCorporation(name);
    if (!overviewRes.found || !overviewRes.corporation) {
      await interaction.editReply({ content: "Corporation not found." });
      return;
    }

    // Cache API responses so tab switches don't re-fetch unnecessarily
    let bondsRes: BondsResponse | null = null;
    let financialsRes: FinancialsResponse | null = null;

    let currentTab: Tab = "overview";

    const message = await interaction.editReply({
      embeds: [buildOverviewEmbed(overviewRes)],
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
            embed = buildOverviewEmbed(overviewRes);
            break;
          case "bonds":
            if (!bondsRes) bondsRes = await getBonds({ corp: name });
            embed = buildBondsEmbed(bondsRes, name);
            break;
          case "financials":
            if (!financialsRes) {
              financialsRes = await getFinancials(name);
              if (!financialsRes.found) {
                await component.editReply({ content: "Could not load financials." });
                return;
              }
            }
            embed = buildFinancialsEmbed(financialsRes);
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
      const msg = "Bot configuration error \u2014 contact an admin.";
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
