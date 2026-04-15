import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { ChartConfiguration } from 'chart.js';
import type { MarketDataResponse, StockChartMarketResponse, StockChartCorpResponse } from './api.js';
import { symbolFor } from './currency.js';

const canvasRenderService = new ChartJSNodeCanvas({
  width: 800,
  height: 400,
  backgroundColour: '#2f3136'
});

export async function generateLineChart(
  data: MarketDataResponse,
  options: { exchange: string; days: number }
): Promise<Buffer> {
  const history = data.history || [];
  
  const configuration = {
    type: 'line' as const,
    data: {
      labels: history.map(point => new Date(point.date).toLocaleDateString()),
      datasets: [{
        label: 'Close Price',
        data: history.map(point => point.close),
        borderColor: '#5865F2',
        backgroundColor: 'rgba(88, 101, 242, 0.1)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.1,
        fill: true
      }, {
        label: 'Volume',
        data: history.map(point => point.volume),
        borderColor: '#EB459E',
        backgroundColor: 'rgba(235, 69, 158, 0.1)',
        borderWidth: 1,
        pointRadius: 0,
        yAxisID: 'y1',
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `${options.exchange} - Last ${options.days} Days`,
          color: '#ffffff',
          font: { size: 16, weight: 'bold' as const }
        },
        legend: {
          labels: { color: '#ffffff' }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#ffffff' }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#ffffff' },
          title: {
            display: true,
            text: 'Price',
            color: '#ffffff'
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#ffffff' },
          title: {
            display: true,
            text: 'Volume',
            color: '#ffffff'
          }
        }
      }
    }
  };

  return canvasRenderService.renderToBuffer(configuration as ChartConfiguration);
}

// ---------------------------------------------------------------------------
// Stock Chart generators (market-wide & per-corporation)
// ---------------------------------------------------------------------------

function formatChartCurrency(value: number, sym: string = "$"): string {
  if (value >= 1_000_000_000) return `${sym}${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${sym}${(value / 1_000).toFixed(1)}K`;
  return `${sym}${value.toFixed(2)}`;
}

export type StockChartMetric = "marketCap" | "sharePrice" | "revenue" | "income";

export async function generateStockChartMarket(
  data: StockChartMarketResponse,
  options: { title: string; metric: StockChartMetric; currency?: string }
): Promise<Buffer> {
  const points = data.points;
  const values = points.map((p) => p.marketCap);
  const sym = symbolFor(options.currency ?? "USD");

  const configuration = {
    type: 'line' as const,
    data: {
      labels: points.map((p) => `T${p.turn}`),
      datasets: [{
        label: 'Market Cap',
        data: values,
        borderColor: '#5865F2',
        backgroundColor: 'rgba(88, 101, 242, 0.1)',
        borderWidth: 2,
        pointRadius: points.length > 50 ? 0 : 2,
        tension: 0.2,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: options.title,
          color: '#ffffff',
          font: { size: 16, weight: 'bold' as const },
        },
        legend: { labels: { color: '#ffffff' } },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#ffffff', maxTicksLimit: 15 },
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: {
            color: '#ffffff',
            callback: (v: number | string) => formatChartCurrency(Number(v), sym),
          },
          title: { display: true, text: 'Market Cap', color: '#ffffff' },
        },
      },
    },
  };

  return canvasRenderService.renderToBuffer(configuration as ChartConfiguration);
}

export async function generateStockChartCorp(
  data: StockChartCorpResponse,
  options: { title: string; metric: StockChartMetric; currency?: string }
): Promise<Buffer> {
  const points = data.points;
  const metric = options.metric;
  const sym = symbolFor(options.currency ?? "USD");

  const values = points.map((p) => p[metric]);
  const metricLabels: Record<StockChartMetric, string> = {
    sharePrice: 'Share Price',
    marketCap: 'Market Cap',
    revenue: 'Revenue',
    income: 'Income',
  };

  const configuration = {
    type: 'line' as const,
    data: {
      labels: points.map((p) => `T${p.turn}`),
      datasets: [{
        label: metricLabels[metric],
        data: values,
        borderColor: '#57F287',
        backgroundColor: 'rgba(87, 242, 135, 0.1)',
        borderWidth: 2,
        pointRadius: points.length > 50 ? 0 : 2,
        tension: 0.2,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: options.title,
          color: '#ffffff',
          font: { size: 16, weight: 'bold' as const },
        },
        legend: { labels: { color: '#ffffff' } },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#ffffff', maxTicksLimit: 15 },
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: {
            color: '#ffffff',
            callback: (v: number | string) => formatChartCurrency(Number(v), sym),
          },
          title: { display: true, text: metricLabels[metric], color: '#ffffff' },
        },
      },
    },
  };

  return canvasRenderService.renderToBuffer(configuration as ChartConfiguration);
}

export async function generateCandleChart(
  data: MarketDataResponse,
  options: { exchange: string; days: number }
): Promise<Buffer> {
  const history = data.history || [];
  
  // Chart.js doesn't have native candlestick, so we'll simulate with bar + line
  const configuration = {
    type: 'bar' as const,
    data: {
      labels: history.map(point => new Date(point.date).toLocaleDateString()),
      datasets: [{
        label: 'Price Range',
        data: history.map(point => ({
          o: point.open,
          h: point.high,
          l: point.low,
          c: point.close
        })),
        backgroundColor: history.map(point => 
          point.close >= point.open 
            ? 'rgba(46, 204, 113, 0.8)' 
            : 'rgba(231, 76, 60, 0.8)'
        ),
        borderColor: history.map(point => 
          point.close >= point.open 
            ? '#2ecc71' 
            : '#e74c3c'
        ),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `${options.exchange} Candlestick - Last ${options.days} Days`,
          color: '#ffffff',
          font: { size: 16, weight: 'bold' as const },
        },
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#ffffff' }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#ffffff' },
          title: {
            display: true,
            text: 'Price',
            color: '#ffffff'
          }
        }
      }
    }
  };

  return canvasRenderService.renderToBuffer(configuration as unknown as ChartConfiguration);
}

// ---------------------------------------------------------------------------
// Forex rate chart — 48h performance, multi-line, colorblind-safe
// ---------------------------------------------------------------------------

export interface ForexRateData {
  currencyCode: string;
  rateHistory: Array<{ turn: number; rate: number }>;
}

const FOREX_COLORS: Record<string, string> = {
  USD: "#4477AA",
  GBP: "#EE6677",
  JPY: "#228833",
  CAD: "#CCBB44",
  EUR: "#AA3377",
};

export async function generateForexChart(rates: ForexRateData[]): Promise<Buffer> {
  // Find common turn range
  const allTurns = new Set<number>();
  for (const r of rates) {
    for (const h of r.rateHistory) allTurns.add(h.turn);
  }
  const turns = [...allTurns].sort((a, b) => a - b);

  const datasets = rates
    .filter((r) => r.rateHistory.length > 1)
    .map((r) => {
      // Use actual first data point as baseline for % change
      const firstReal = r.rateHistory[0].rate;
      const rateMap = new Map(r.rateHistory.map((h) => [h.turn, h.rate]));
      const rawValues = turns.map((t) => rateMap.get(t) ?? NaN);

      // Fill NaN gaps with last known value
      let last = rawValues.find((v) => !isNaN(v)) ?? 0;
      const filled = rawValues.map((v) => {
        if (!isNaN(v)) { last = v; return v; }
        return last;
      });

      // Normalize to % change from actual first data point
      const pctValues = (!firstReal || !isFinite(firstReal))
        ? filled.map(() => 0)
        : filled.map((v) => ((v - firstReal) / firstReal) * 100);

      const sym = symbolFor(r.currencyCode);
      return {
        label: `${r.currencyCode} (${sym})`,
        data: pctValues,
        borderColor: FOREX_COLORS[r.currencyCode] ?? "#999999",
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.2,
        fill: false,
      };
    });

  const configuration = {
    type: "line" as const,
    data: {
      labels: turns.map((t) => `T${t}`),
      datasets,
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `Currency Performance \u2014 Last ${turns.length} Turns`,
          color: "#ffffff",
          font: { size: 16, weight: "bold" as const },
        },
        legend: {
          labels: { color: "#ffffff", usePointStyle: true },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.1)" },
          ticks: { color: "#ffffff", maxTicksLimit: 12 },
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.1)" },
          ticks: {
            color: "#ffffff",
            callback: (v: number | string) => {
              const n = Number(v);
              return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
            },
          },
          title: { display: true, text: "Change %", color: "#ffffff" },
        },
      },
    },
  };

  return canvasRenderService.renderToBuffer(configuration as ChartConfiguration);
}