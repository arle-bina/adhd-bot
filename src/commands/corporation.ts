import {
  SlashCommandBuilder,
  EmbedBuilder,
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
  type BondsResponse,
  type FinancialsResponse,
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

function currency(n: number | undefined | null): string {
  return "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function price(n: number | undefined | null): string {
  return "$" + (n ?? 0).toFixed(2);
}

function incomePrefix(n: number | undefined | null): string {
  const v = n ?? 0;
  const sign = v >= 0 ? "+" : "-";
  return `${sign}${currency(Math.abs(v))}`;
}

/** Right-align a dollar amount string to a fixed width for code blocks. */
function padDollar(label: string, n: number | undefined | null, width: number): string {
  const val = currency(n);
  return `${label}${val.padStart(width)}`;
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
      .setName("view")
      .setDescription("What to display (default: Overview)")
      .addChoices(
        { name: "Overview", value: "overview" },
        { name: "Bonds", value: "bonds" },
        { name: "Financials", value: "financials" },
      )
  );

export const cooldown = 5;

// ---------------------------------------------------------------------------
// View: Overview
// ---------------------------------------------------------------------------

async function handleOverview(interaction: ChatInputCommandInteraction, name: string): Promise<void> {
  const res = await getCorporation(name);

  if (!res.found || !res.corporation) {
    await interaction.editReply({ content: "Corporation not found." });
    return;
  }

  const corp = res.corporation;
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
    .setFooter({ text: "ahousedividedgame.com \u00b7 Use /corporation view:Bonds or view:Financials for more" });

  if (corp.logoUrl) embed.setThumbnail(corp.logoUrl);
  if (corp.description) embed.setDescription(corp.description.slice(0, 4096));

  const ceoValue = ceo
    ? (ceo.profileUrl ? `[${ceo.name}](${ceo.profileUrl})` : ceo.name)
    : "Vacant";

  embed.addFields(
    { name: "Type", value: corp.typeLabel, inline: true },
    { name: "HQ", value: corp.headquartersStateName, inline: true },
    { name: "CEO", value: ceoValue, inline: true },
    { name: "Liquid Capital", value: currency(corp.liquidCapital), inline: true },
    { name: "Share Price", value: price(corp.sharePrice), inline: true },
    { name: "Market Cap", value: currency(corp.marketCapitalization), inline: true },
    { name: "Daily Revenue", value: currency(financials.totalRevenue), inline: true },
    { name: "Daily Costs", value: currency(financials.totalCosts), inline: true },
    { name: "Daily Income", value: incomePrefix(financials.income), inline: true },
  );

  // Dividends — omit if rate is 0
  if ((corp.dividendRate ?? 0) !== 0) {
    embed.addFields({
      name: "Dividends",
      value: `${corp.dividendRate}% \u00b7 ${currency(financials.dailyDividendPayout)}/day`,
      inline: true,
    });
  }

  // Credit Rating
  if (creditRating) {
    embed.addFields({
      name: "Credit Rating",
      value: `${creditRating.rating} (${creditRating.compositeScore ?? 0}/100)`,
      inline: true,
    });
  }

  // Debt — omit if no bonds
  if (bonds.length > 0) {
    const totalDebt = bonds.reduce((sum, b) => sum + (b.totalIssued ?? 0), 0);
    embed.addFields({
      name: "Debt",
      value: `${currency(totalDebt)} (${bonds.length} bond${bonds.length === 1 ? "" : "s"})`,
      inline: true,
    });
  }

  // Shareholders (NOT inline)
  if (shareholders.length > 0) {
    const maxShow = 3;
    const lines = shareholders.slice(0, maxShow).map(
      (s) => `${s.name} \u2014 ${(s.shares ?? 0).toLocaleString("en-US")} (${(s.percentage ?? 0).toFixed(1)}%)`
    );
    // Public float line
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

  // Marketing (NOT inline)
  embed.addFields({
    name: "Marketing",
    value: `Budget: ${currency(corp.marketingBudget)} \u00b7 Strength: ${corp.marketingStrength ?? 0}`,
    inline: false,
  });

  // Sectors (NOT inline)
  if (sectors.length > 0) {
    const maxShow = 5;
    const lines = sectors.slice(0, maxShow).map(
      (s) =>
        `${s.stateName ?? "Unknown"} \u2014 ${currency(s.revenue)} rev \u00b7 ${s.growthRate ?? 0}% growth \u00b7 ${s.workers ?? 0} workers`
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

  await interaction.editReply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// View: Bonds
// ---------------------------------------------------------------------------

async function handleBonds(interaction: ChatInputCommandInteraction, name: string): Promise<void> {
  const res: BondsResponse = await getBonds({ corp: name });

  if (!res.bonds || res.bonds.length === 0) {
    await interaction.editReply({ content: `No bonds found for ${name}.` });
    return;
  }

  const color = hexToInt(res.bonds[0].brandColor) || 0x3b82f6;

  const bondLines = res.bonds.map((b) => {
    const prefix = b.defaulted ? "\u26a0\ufe0f DEFAULTED \u2014 " : "";
    const label = `${b.maturityLabel} @ ${(b.couponRate ?? 0).toFixed(1)}%`;
    const url = b.bondUrl ? `[${label}](${b.bondUrl})` : label;
    const details = `Price: ${price(b.marketPrice)} \u00b7 YTM: ${(b.yieldToMaturity ?? 0).toFixed(1)}% \u00b7 ${currency(b.totalIssued)} issued \u00b7 ${b.turnsRemaining ?? 0} turns left`;
    return `${prefix}**${url}**\n${details}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`${res.filterCorp ?? name} \u2014 Bonds`.slice(0, 256))
    .setColor(color)
    .setDescription(bondLines.join("\n\n").slice(0, 4096))
    .addFields(
      { name: "Total Debt Outstanding", value: currency(res.totalOutstandingDebt), inline: true },
      { name: "Active Bonds", value: String(res.bonds.length), inline: true },
    )
    .setFooter({ text: "ahousedividedgame.com \u00b7 Use /corporation view:Overview or view:Financials" });

  await interaction.editReply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// View: Financials
// ---------------------------------------------------------------------------

async function handleFinancials(interaction: ChatInputCommandInteraction, name: string): Promise<void> {
  const res: FinancialsResponse = await getFinancials(name);

  if (!res.found) {
    await interaction.editReply({ content: "Corporation not found." });
    return;
  }

  const corp = res.corporation;
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

  // Income Statement
  const W = 14; // column width for dollar values
  const incomeBlock = [
    padDollar("Revenue:       ", inc.totalRevenue, W),
    padDollar("- Operating:   ", inc.costs.operatingTotal, W),
    padDollar("- Interest:    ", inc.costs.bondInterest, W),
    padDollar("= Net Income:  ", inc.netIncome, W),
    padDollar("Dividends:     ", inc.dailyDividendPayout, W) + ` (${inc.dividendRate ?? 0}%)`,
    padDollar("Retained:      ", inc.retainedEarnings, W),
  ].join("\n");
  embed.addFields({
    name: "Income Statement",
    value: `\`\`\`\n${incomeBlock}\n\`\`\``.slice(0, 1024),
    inline: false,
  });

  // Balance Sheet
  const balBlock = [
    padDollar("Assets:   ", bal.assets.totalAssets, W),
    padDollar("  Cash:   ", bal.assets.cashOnHand, W),
    padDollar("  NPV:    ", bal.assets.sectorNPV, W),
    padDollar("Debt:     ", bal.liabilities.outstandingDebt, W) + ` (${bal.liabilities.bondCount ?? 0} bond${(bal.liabilities.bondCount ?? 0) === 1 ? "" : "s"})`,
    padDollar("Equity:   ", bal.equity.bookValue, W),
  ].join("\n");
  embed.addFields({
    name: "Balance Sheet",
    value: `\`\`\`\n${balBlock}\n\`\`\``.slice(0, 1024),
    inline: false,
  });

  // Share Structure
  const shareLines: string[] = [
    `Price: ${price(shares.sharePrice)} \u00b7 Market Cap: ${currency(shares.marketCapitalization)}`,
    `Float: ${(shares.publicFloat ?? 0).toLocaleString("en-US")} (${(shares.publicFloatPct ?? 0).toFixed(1)}%)`,
    "",
  ];
  for (const sh of shares.shareholders ?? []) {
    const valStr = currency(sh.value);
    shareLines.push(`${sh.name}     ${(sh.shares ?? 0).toLocaleString("en-US")} (${(sh.percentage ?? 0).toFixed(1)}%)  ${valStr}`);
  }
  embed.addFields({
    name: "Share Structure",
    value: shareLines.join("\n").slice(0, 1024),
    inline: false,
  });

  // Credit Rating (inline)
  const comp = credit.components;
  embed.addFields({
    name: "Credit Rating",
    value: `${credit.rating} (${credit.compositeScore ?? 0}/100)\nD/E: ${(comp.debtToEquity ?? 0).toFixed(1)} \u00b7 IC: ${(comp.interestCoverage ?? 0).toFixed(1)} \u00b7 Prof: ${(comp.profitability ?? 0).toFixed(1)} \u00b7 Liq: ${(comp.liquidity ?? 0).toFixed(1)}`.slice(0, 1024),
    inline: true,
  });

  // Coupon Rate (inline)
  embed.addFields({
    name: "Coupon Rate",
    value: `${(credit.effectiveCouponRate ?? 0).toFixed(1)}% (Prime: ${(credit.primeRate ?? 0).toFixed(1)}%)`,
    inline: true,
  });

  // Outstanding Bonds (NOT inline)
  if (bonds.length > 0) {
    const bondLines = bonds.map((b) => {
      const prefix = b.defaulted ? "\u26a0\ufe0f " : "";
      return `${prefix}${b.maturityLabel} @ ${(b.couponRate ?? 0).toFixed(1)}% \u2014 ${currency(b.totalIssued)} \u00b7 Price: ${price(b.marketPrice)} \u00b7 YTM: ${(b.yieldToMaturity ?? 0).toFixed(1)}%`;
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

  // Sector P&L (NOT inline)
  if (sectors.length > 0) {
    const maxShow = 5;
    const sorted = [...sectors].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
    const lines = sorted.slice(0, maxShow).map(
      (s) =>
        `${s.stateName ?? "Unknown"} \u2014 ${currency(s.revenue)} rev \u00b7 ${(s.effectiveMargin ?? 0).toFixed(1)}% margin \u00b7 ${currency(s.profit)} profit`
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

  await interaction.editReply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const name = interaction.options.getString("name", true);
  const view = interaction.options.getString("view") ?? "overview";

  try {
    switch (view) {
      case "bonds":
        await handleBonds(interaction, name);
        break;
      case "financials":
        await handleFinancials(interaction, name);
        break;
      default:
        await handleOverview(interaction, name);
        break;
    }
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
