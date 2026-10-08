// Message builders for the feature commands. Each returns a payload usable by
// both a slash command editReply and a component interaction update.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type AttachmentBuilder } from "discord.js";
import {
  getBills,
  getCommodities,
  getCommodityDetail,
  getConflicts,
  getCountryBudget,
  getCountryEconomy,
  getCountryEconomyHistory,
  getCountryLegislature,
  getCountryMetrics,
  getCountrySummary,
  getLiveTurnStatus,
  getReferendums,
  type BillBucket,
  type HistoryPoint,
} from "./api-features.js";
import {
  COUNTRY_TAB_LABELS,
  COUNTRY_TABS,
  clampPage,
  compact,
  controlSplit,
  discordTime,
  featId,
  formatDuration,
  humanize,
  leaderLine,
  pageCount,
  pct,
  progressBar,
  secondsUntil,
  share,
  sideLabel,
  truncate,
  unemploymentPct,
  type CountryTab,
} from "./featureFormat.js";
import { standardFooter } from "./helpers.js";
import { symbolFor } from "./currency.js";
import { renderChamber, renderTimeSeries, brandColor, compactMoney } from "./viz/index.js";
import { chartAttachment } from "./viz/attach.js";

export interface FeaturePayload {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  files: AttachmentBuilder[];
}

const COLOR = 0x5865f2;
export const WARS_PER_PAGE = 5;
export const BILLS_PER_PAGE = 6;

function button(id: string, label: string, opts: { active?: boolean; disabled?: boolean } = {}): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(opts.active ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setDisabled(opts.disabled === true);
}

// The ":r" suffix keeps Refresh distinct from the tab or page button that
// shares its view id. Discord rejects a message with duplicate custom ids
// (50035), and the router ignores trailing args.
function refreshButton(id: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(`${id}:r`).setLabel("Refresh").setStyle(ButtonStyle.Success);
}

function row(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

function notFound(text: string): FeaturePayload {
  return { embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(text)], components: [], files: [] };
}

function zipByTurn(a: HistoryPoint[], b: HistoryPoint[]): { turns: number[]; a: number[]; b: number[] } {
  const bMap = new Map(b.map((p) => [p.turn, p.value]));
  const turns: number[] = [];
  const av: number[] = [];
  const bv: number[] = [];
  for (const p of a) {
    const other = bMap.get(p.turn);
    if (other === undefined) continue;
    turns.push(p.turn);
    av.push(p.value);
    bv.push(other);
  }
  return { turns, a: av, b: bv };
}

// ---------------------------------------------------------------------------
// /country
// ---------------------------------------------------------------------------

export function countryRows(tab: CountryTab, c: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    row(...COUNTRY_TABS.map((t) => button(featId("country", t, c), COUNTRY_TAB_LABELS[t], { active: t === tab }))),
    row(refreshButton(featId("country", tab, c))),
  ];
}

export async function buildCountryView(tab: CountryTab, countryCode: string): Promise<FeaturePayload> {
  const c = countryCode.toUpperCase();
  const footer = standardFooter(`Country ${c}`);

  if (tab === "overview") {
    const [summary, eco] = await Promise.all([getCountrySummary(c), getCountryEconomy(c)]);
    if (!summary.found) return notFound(`Country **${c}** was not found.`);
    const cur = eco.currencyCode ?? "USD";
    const sym = symbolFor(cur);
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(truncate(`${summary.name} (${c})`, 256))
      .addFields(
        { name: "Leader", value: truncate(leaderLine(summary.currentLeader), 1024), inline: true },
        { name: "Government", value: summary.governmentType ? humanize(summary.governmentType) : "n/a", inline: true },
        { name: "Population", value: compact(eco.population ?? summary.population), inline: true },
        { name: "GDP", value: eco.gdp != null ? compactMoney(eco.gdp, sym) : "n/a", inline: true },
        { name: "Growth", value: pct(eco.gdpGrowth, 1, true), inline: true },
        { name: "Inflation", value: pct(eco.inflation), inline: true },
        {
          name: "Debt",
          value: eco.debt ? `${pct(eco.debt.debtToGdpRatio)} of GDP (${eco.debt.creditRating ?? "unrated"})` : "n/a",
          inline: true,
        },
        { name: "Prime rate", value: pct(eco.primeRate, 2), inline: true },
        {
          name: "Top parties",
          value:
            truncate(
              summary.legislatureComposition
                .slice(0, 4)
                .map((p) => `${p.partyName}: ${p.seats} (${p.seatPct ?? 0}%)`)
                .join("\n"),
              1024,
            ) || "No seats filled",
        },
      )
      .setTimestamp()
      .setFooter(footer);
    return { embeds: [embed], components: countryRows(tab, c), files: [] };
  }

  if (tab === "economy") {
    const [eco, hist, metrics] = await Promise.all([
      getCountryEconomy(c),
      getCountryEconomyHistory(c, 60),
      getCountryMetrics(c, "economic").catch(() => null),
    ]);
    if (!eco.found) return notFound(`Country **${c}** was not found.`);
    const cur = eco.currencyCode ?? "USD";
    const sym = symbolFor(cur);
    const unemployment = unemploymentPct(
      metrics?.categories?.economic?.unemploymentRate?.populationWeightedAverage,
    );
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`${c} economy`)
      .addFields(
        { name: "GDP", value: eco.gdp != null ? compactMoney(eco.gdp, sym) : "n/a", inline: true },
        { name: "GDP per capita", value: eco.gdpPerCapita != null ? `${sym}${compact(eco.gdpPerCapita)}` : "n/a", inline: true },
        { name: "Growth", value: pct(eco.gdpGrowth, 2, true), inline: true },
        { name: "Inflation", value: pct(eco.inflation, 2), inline: true },
        { name: "Unemployment", value: unemployment != null ? pct(unemployment) : "n/a", inline: true },
        { name: "Prime rate", value: pct(eco.primeRate, 2), inline: true },
        {
          name: "Budget balance",
          value: eco.budgetBalance != null ? `${compactMoney(eco.budgetBalance, sym)} (${pct(eco.budgetBalancePctGdp, 1, true)} GDP)` : "n/a",
          inline: true,
        },
        { name: "Investor confidence", value: eco.investorConfidence != null ? eco.investorConfidence.toFixed(1) : "n/a", inline: true },
        {
          name: "Stock market",
          value: `${eco.stockMarket.exchange ?? "n/a"}: ${compactMoney(eco.stockMarket.totalMarketCap, sym)} (${pct(eco.stockMarket.change24h, 2, true)} 24h)`,
        },
      )
      .setTimestamp()
      .setFooter(footer);

    const inflationHist: HistoryPoint[] = hist.series.inflation.length
      ? hist.series.inflation
      : eco.inflationHistory.map((p) => ({ turn: p.turn, value: p.rate }));
    const growthHist: HistoryPoint[] = hist.series.gdpGrowth.length
      ? hist.series.gdpGrowth
      : eco.gdpGrowthHistory.map((p) => ({ turn: p.turn, value: p.rate }));
    const z = zipByTurn(inflationHist, growthHist);
    const files: AttachmentBuilder[] = [];
    if (z.turns.length >= 2) {
      const chart = chartAttachment(
        renderTimeSeries({
          title: `${c} inflation and growth`,
          subtitle: `T${z.turns[0]} to T${z.turns[z.turns.length - 1]}`,
          footerLeft: "Rates in percent",
          labels: z.turns.map((t) => `T${t}`),
          series: [
            { name: "Inflation", values: z.a },
            { name: "GDP growth", values: z.b },
          ],
          valueFormat: "percent",
          zeroBaseline: true,
        }),
        "country-economy",
        `${c}-${tab}`,
      );
      embed.setImage(chart.url);
      files.push(chart.file);
    }
    return { embeds: [embed], components: countryRows(tab, c), files };
  }

  if (tab === "legislature") {
    const leg = await getCountryLegislature(c);
    if (!leg.found) return notFound(`Country **${c}** was not found.`);
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(truncate(`${c} ${leg.chamber}`, 256))
      .setTimestamp()
      .setFooter(footer);
    const files: AttachmentBuilder[] = [];
    if (leg.composition.length > 0) {
      const total = leg.totalSeats || leg.composition.reduce((s, p) => s + p.seats, 0);
      const chart = chartAttachment(
        await renderChamber({
          title: `${c} ${leg.chamber}`,
          subtitle: `${total} seats · ${Math.floor(total / 2) + 1} for a majority`,
          totalSeats: total,
          majority: Math.floor(total / 2) + 1,
          shape: c === "UK" ? "westminster" : "arch",
          parties: leg.composition.map((p, i) => ({ name: p.partyName, seats: p.seats, color: brandColor(p.partyColor, i) })),
        }),
        "country-legislature",
        c,
      );
      embed.setImage(chart.url);
      files.push(chart.file);
    }
    embed.addFields(
      {
        name: "Pending bills",
        value:
          truncate(
            leg.pendingBills
              .map((b) => `${truncate(b.title, 80)} (${humanize(b.status)})${b.scheduledVoteAt ? ` vote ${discordTime(b.scheduledVoteAt)}` : ""}`)
              .join("\n"),
            1024,
          ) || "None",
      },
      {
        name: "Recently passed",
        value:
          truncate(
            leg.recentlyPassed.map((b) => `${truncate(b.title, 80)} (${b.vote.yes}-${b.vote.no})`).join("\n"),
            1024,
          ) || "None",
      },
    );
    return { embeds: [embed], components: countryRows(tab, c), files };
  }

  // budget
  const [budget, hist] = await Promise.all([getCountryBudget(c), getCountryEconomyHistory(c, 60)]);
  if (!budget.found || !budget.revenue || !budget.spending || !budget.debt) {
    return notFound(`No budget data for **${c}**.`);
  }
  const sym = symbolFor(budget.currencyCode ?? "USD");
  const money = (v: number | null | undefined) => (v != null ? compactMoney(v, sym) : "n/a");
  const topSpend = Object.entries(budget.spending.byCategory)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 5)
    .map(([k, v]) => `${humanize(k)}: ${money(v)} (${pct(share(v, budget.spending?.total ?? 0), 0)})`)
    .join("\n");
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${c} budget${budget.fiscalYear != null ? `, FY${budget.fiscalYear}` : ""}`)
    .addFields(
      { name: "Revenue", value: money(budget.revenue.total), inline: true },
      { name: "Spending", value: money(budget.spending.total), inline: true },
      { name: "Balance", value: `${money(budget.balance)} (${pct(budget.balancePctGdp ?? null, 1, true)})`, inline: true },
      { name: "Debt", value: money(budget.debt.principal), inline: true },
      { name: "Debt to GDP", value: pct(budget.debt.debtToGdpRatio), inline: true },
      { name: "Credit rating", value: `${budget.debt.creditRating ?? "n/a"} (${humanize(budget.debt.crisisState)})`, inline: true },
      { name: "Treasury", value: money(budget.treasuryBalance), inline: true },
      { name: "Debt interest", value: money(budget.spending.debtInterest), inline: true },
      { name: "Largest spending", value: truncate(topSpend, 1024) || "n/a" },
    )
    .setTimestamp()
    .setFooter(footer);
  const files: AttachmentBuilder[] = [];
  if (hist.fiscalYears.length >= 2) {
    const chart = chartAttachment(
      renderTimeSeries({
        title: `${c} revenue vs spending`,
        subtitle: `FY${hist.fiscalYears[0].fiscalYear} to FY${hist.fiscalYears[hist.fiscalYears.length - 1].fiscalYear}`,
        footerLeft: `Values ${budget.currencyCode ?? "USD"}`,
        labels: hist.fiscalYears.map((f) => `FY${f.fiscalYear}`),
        series: [
          { name: "Revenue", values: hist.fiscalYears.map((f) => f.revenue) },
          { name: "Spending", values: hist.fiscalYears.map((f) => f.spending) },
        ],
        valueFormat: "money",
        currencySymbol: sym,
      }),
      "country-budget",
      c,
    );
    embed.setImage(chart.url);
    files.push(chart.file);
  }
  return { embeds: [embed], components: countryRows(tab, c), files };
}

// ---------------------------------------------------------------------------
// /commodity
// ---------------------------------------------------------------------------

export async function buildCommodityList(country?: string): Promise<FeaturePayload> {
  const { commodities } = await getCommodities(country);
  const lines = commodities.map((x) => {
    const delta = x.basePrice > 0 ? ((x.globalPrice - x.basePrice) / x.basePrice) * 100 : 0;
    const balance = x.globalSupply - x.globalDemand;
    return `**${x.label}**: ${x.globalPrice.toFixed(2)} per ${x.unit} (${pct(delta, 0, true)} vs base, ${balance >= 0 ? "surplus" : "deficit"})`;
  });
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("Commodity prices")
    .setDescription(truncate(lines.join("\n"), 4000) || "No commodities.")
    .setTimestamp()
    .setFooter(standardFooter("Use /commodity key: for detail"));
  return { embeds: [embed], components: [row(refreshButton(featId("commodity", "list", country ?? "-")))], files: [] };
}

export async function buildCommodityDetail(key: string, country?: string): Promise<FeaturePayload> {
  const res = await getCommodityDetail(key, country);
  if (!res.found) return notFound(`Unknown commodity **${key}**.`);
  const x = res.commodity;
  const prices = Object.entries(x.statePrices).sort((a, b) => a[1] - b[1]);
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${x.label}${country ? ` (${country.toUpperCase()})` : ""}`)
    .addFields(
      { name: "Global price", value: `${x.globalPrice.toFixed(2)} / ${x.unit}`, inline: true },
      { name: "Base price", value: x.basePrice.toFixed(2), inline: true },
      { name: "Turn", value: String(x.turn), inline: true },
      { name: "Supply", value: compact(x.globalSupply), inline: true },
      { name: "Demand", value: compact(x.globalDemand), inline: true },
      {
        name: "Balance",
        value: x.globalSupply >= x.globalDemand ? "Surplus" : "Deficit",
        inline: true,
      },
    )
    .setTimestamp()
    .setFooter(standardFooter("Commodity"));
  if (x.nationalPrice != null) {
    embed.addFields({ name: `${country?.toUpperCase()} price`, value: x.nationalPrice.toFixed(2), inline: true });
  }
  if (x.topProducers.length) {
    embed.addFields({
      name: "Top producers",
      value: truncate(x.topProducers.slice(0, 5).map((p) => `${p.stateId}: ${compact(p.supply)}`).join("\n"), 1024),
      inline: true,
    });
  }
  if (x.topConsumers.length) {
    embed.addFields({
      name: "Top consumers",
      value: truncate(x.topConsumers.slice(0, 5).map((p) => `${p.stateId}: ${compact(p.demand)}`).join("\n"), 1024),
      inline: true,
    });
  }
  const files: AttachmentBuilder[] = [];
  // The API exposes no price history, so the chart is the regional price spread.
  if (prices.length >= 3) {
    const chart = chartAttachment(
      renderTimeSeries({
        title: `${x.label} regional price spread`,
        subtitle: `${prices.length} regions, lowest to highest`,
        footerLeft: `Turn ${x.turn}`,
        labels: prices.map(([id]) => id),
        series: [{ name: "Price", values: prices.map(([, v]) => v) }],
        valueFormat: "decimal",
        fill: true,
      }),
      "commodity",
      `${x.key}-${country ?? "all"}`,
    );
    embed.setImage(chart.url);
    files.push(chart.file);
  }
  return {
    embeds: [embed],
    components: [row(refreshButton(featId("commodity", "detail", x.key, country ?? "-")), button(featId("commodity", "list", country ?? "-"), "All commodities"))],
    files,
  };
}

// ---------------------------------------------------------------------------
// /wars
// ---------------------------------------------------------------------------

export async function buildWarsView(page: number, country?: string): Promise<FeaturePayload> {
  const res = await getConflicts({ country, status: "active", limit: 100 });
  const list = res.found ? res.conflicts : [];
  const pages = pageCount(list.length, WARS_PER_PAGE);
  const p = clampPage(page, pages);
  const slice = list.slice(p * WARS_PER_PAGE, (p + 1) * WARS_PER_PAGE);
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`Active conflicts${country ? ` involving ${country.toUpperCase()}` : ""}`)
    .setTimestamp()
    .setFooter(standardFooter(`Page ${p + 1}/${pages} · ${list.length} active`));
  if (slice.length === 0) embed.setDescription("No active conflicts.");
  for (const w of slice) {
    const { a, b } = controlSplit(w.control);
    embed.addFields({
      name: truncate(`#${w.conflictId} ${w.name}`, 256),
      value: truncate(
        [
          `${sideLabel(w.sideA)} vs ${sideLabel(w.sideB)}`,
          `Control ${pct(a, 0)} / ${pct(b, 0)} · ${humanize(w.type)} · ${w.hostCountry}, ${w.region}`,
          `Severity ${w.severity} · Intensity ${w.intensity}`,
        ].join("\n"),
        1024,
      ),
    });
  }
  const c = country?.toUpperCase() ?? "-";
  return {
    embeds: [embed],
    components: [
      row(
        button(featId("wars", p - 1, c), "Prev", { disabled: p <= 0 }),
        button(featId("wars", p + 1, c), "Next", { disabled: p >= pages - 1 }),
        refreshButton(featId("wars", p, c)),
      ),
    ],
    files: [],
  };
}

// ---------------------------------------------------------------------------
// /legislation
// ---------------------------------------------------------------------------

export type LegMode = BillBucket | "referendums";
export const LEG_MODES: readonly LegMode[] = ["pending", "passed", "failed", "referendums"];

export function isLegMode(v: string): v is LegMode {
  return (LEG_MODES as readonly string[]).includes(v);
}

export async function buildLegislationView(mode: LegMode, page: number, country?: string): Promise<FeaturePayload> {
  const c = country?.toUpperCase();
  const cId = c ?? "-";
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTimestamp();
  let total = 0;
  let p = 0;
  let pages = 1;

  if (mode === "referendums") {
    const res = await getReferendums({ country: c, limit: 50 });
    const list = res.found ? res.referendums : [];
    total = list.length;
    pages = pageCount(total, BILLS_PER_PAGE);
    p = clampPage(page, pages);
    embed.setTitle(`Referendums${c ? ` in ${c}` : ""}`);
    if (list.length === 0) embed.setDescription("No referendums.");
    for (const r of list.slice(p * BILLS_PER_PAGE, (p + 1) * BILLS_PER_PAGE)) {
      const outcome = r.result
        ? `${r.result.passed ? "Passed" : "Failed"} ${pct(r.result.yesShare, 1)} yes, turnout ${pct(r.result.turnout, 0)}`
        : r.campaign.yesShare != null
          ? `Polling ${pct(r.campaign.yesShare, 1)} yes`
          : humanize(r.status);
      embed.addFields({
        name: truncate(`${r.countryId}: ${humanize(r.kind)} in ${r.region.name}`, 256),
        value: truncate(`${humanize(r.status)} · ${outcome}`, 1024),
      });
    }
  } else {
    const res = await getBills({ country: c, status: mode, limit: 50 });
    const list = res.found ? res.bills : [];
    total = list.length;
    pages = pageCount(total, BILLS_PER_PAGE);
    p = clampPage(page, pages);
    embed.setTitle(`${humanize(mode)} legislation${c ? ` in ${c}` : ""}`);
    if (list.length === 0) embed.setDescription("No bills.");
    for (const b of list.slice(p * BILLS_PER_PAGE, (p + 1) * BILLS_PER_PAGE)) {
      const sponsor = b.sponsor ? `${b.sponsor}${b.sponsorParty ? ` (${b.sponsorParty})` : ""}` : "n/a";
      embed.addFields({
        name: truncate(b.title, 256),
        value: truncate(
          `${b.country ?? ""} ${humanize(b.status)} · Sponsor ${sponsor}\nVote ${b.vote.yes}-${b.vote.no}-${b.vote.abstain}${b.votedAt ? ` · ${discordTime(b.votedAt)}` : ""}`.trim(),
          1024,
        ),
      });
    }
  }
  embed.setFooter(standardFooter(`Page ${p + 1}/${pages} · ${total} shown`));
  return {
    embeds: [embed],
    components: [
      row(...LEG_MODES.map((m) => button(featId("leg", m, 0, cId), humanize(m), { active: m === mode }))),
      row(
        button(featId("leg", mode, p - 1, cId), "Prev", { disabled: p <= 0 }),
        button(featId("leg", mode, p + 1, cId), "Next", { disabled: p >= pages - 1 }),
        refreshButton(featId("leg", mode, p, cId)),
      ),
    ],
    files: [],
  };
}

// ---------------------------------------------------------------------------
// /turn
// ---------------------------------------------------------------------------

export async function buildTurnView(): Promise<FeaturePayload> {
  const s = await getLiveTurnStatus();
  const paused = s.pausedAt != null || !s.isActive;
  const embed = new EmbedBuilder()
    .setTitle("Game Clock")
    .setColor(paused ? 0xfee75c : s.isProcessing ? 0xeb459e : COLOR)
    .addFields(
      { name: "Turn", value: s.currentTurn.toLocaleString(), inline: true },
      { name: "Game Year", value: `Year ${s.currentYear}`, inline: true },
      { name: "Last Processed", value: discordTime(s.lastTurnProcessed), inline: true },
    )
    .setTimestamp()
    .setFooter(standardFooter(s.fastMode ? "Fast mode" : undefined));

  if (paused) {
    embed.addFields({
      name: "Paused",
      value: truncate(`The game is paused${s.pauseReason ? `: ${s.pauseReason}` : ""}${s.pausedAt ? ` (since ${discordTime(s.pausedAt)})` : ""}`, 1024),
    });
  } else if (s.isProcessing) {
    embed.addFields({
      name: `Processing turn ${s.processingTargetTurn ?? s.currentTurn + 1}`,
      value: `${s.processingPhaseLabel ?? "Starting"}\n${progressBar(s.processingProgress)}${s.processingStartedAt ? `\nStarted ${discordTime(s.processingStartedAt)}` : ""}`,
    });
  } else {
    const secs = secondsUntil(s.nextScheduledTurn);
    embed.addFields({
      name: "Next Turn",
      value: s.nextScheduledTurn ? `${discordTime(s.nextScheduledTurn)}${secs ? ` (in ${formatDuration(secs)})` : ""}` : "Not scheduled",
    });
  }
  return { embeds: [embed], components: [row(refreshButton(featId("turn")))], files: [] };
}
