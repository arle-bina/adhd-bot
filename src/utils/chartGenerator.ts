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
    type: 'line',
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
          font: { size: 16, weight: 'bold' }
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

  return canvasRenderService.renderToBuffer(configuration);
}

export async function generateCandleChart(
  data: MarketDataResponse,
  options: { exchange: string; days: number }
): Promise<Buffer> {
  const history = data.history || [];
  
  // Chart.js doesn't have native candlestick, so we'll simulate with bar + line
  const configuration = {
    type: 'bar',
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
          font: { size: 16, weight: 'bold' }
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

  return canvasRenderService.renderToBuffer(configuration);
}