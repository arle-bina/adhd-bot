import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { MarketDataResponse } from './api.js';

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
          type: 'linear' as const,
          display: true,
          position: 'left' as const,
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#ffffff' },
          title: {
            display: true,
            text: 'Price',
            color: '#ffffff'
          }
        },
        y1: {
          type: 'linear' as const,
          display: true,
          position: 'right' as const,
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

  return canvasRenderService.renderToBuffer(configuration);
}

export async function generateCandleChart(
  data: MarketDataResponse,
  options: { exchange: string; days: number }
): Promise<Buffer> {
  const history = data.history || [];

  const labels = history.map(point => new Date(point.date).toLocaleDateString());

  // Wick dataset: thin floating bars from low to high
  const wickData = history.map(point => [point.low, point.high] as [number, number]);
  const wickColors = history.map(point =>
    point.close >= point.open ? '#2ecc71' : '#e74c3c'
  );

  // Body dataset: floating bars from min(open, close) to max(open, close)
  const bodyData = history.map(point =>
    [Math.min(point.open, point.close), Math.max(point.open, point.close)] as [number, number]
  );
  const bodyBackgrounds = history.map(point =>
    point.close >= point.open
      ? 'rgba(46, 204, 113, 0.8)'
      : 'rgba(231, 76, 60, 0.8)'
  );
  const bodyBorders = history.map(point =>
    point.close >= point.open ? '#2ecc71' : '#e74c3c'
  );

  const configuration = {
    type: 'bar' as const,
    data: {
      labels,
      datasets: [
        {
          label: 'Wick',
          data: wickData,
          backgroundColor: wickColors,
          borderColor: wickColors,
          borderWidth: 1,
          barPercentage: 0.1,
          categoryPercentage: 1.0,
          order: 2
        },
        {
          label: 'Body',
          data: bodyData,
          backgroundColor: bodyBackgrounds,
          borderColor: bodyBorders,
          borderWidth: 1,
          barPercentage: 0.6,
          categoryPercentage: 0.8,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `${options.exchange} Candlestick - Last ${options.days} Days`,
          color: '#ffffff',
          font: { size: 16, weight: 'bold' as const }
        },
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#ffffff' }
        },
        y: {
          stacked: false,
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

  return canvasRenderService.renderToBuffer(configuration);
}
