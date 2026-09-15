import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPremiumAnalytics, buildPremiumSeries } from '../public/core/premium-analytics.js';

const portfolio = {
  totals: {
    invested: 10000,
    activeValue: 11800,
    salesProceeds: 2500,
    realizedProfit: 700,
    unrealizedProfit: 1800,
    totalProfit: 2500,
    dailyProfit: 260,
    dailyPct: 2.18,
    totalProfitPct: 25,
  },
  holdings: [
    { ticker:'AAA', sector:'Teknoloji', invested:4000, activeValue:6200, realizedProfit:300, unrealizedProfit:1500, totalProfit:1800, dailyProfit:180, currentLots:40 },
    { ticker:'BBB', sector:'Enerji', invested:3500, activeValue:3600, realizedProfit:250, unrealizedProfit:100, totalProfit:350, dailyProfit:100, currentLots:20 },
    { ticker:'CCC', sector:'Teknoloji', invested:2500, activeValue:2000, realizedProfit:150, unrealizedProfit:200, totalProfit:350, dailyProfit:-20, currentLots:10 },
  ],
};

const history = [
  { date:'2026-09-01', value:10000, cost:10000, profit:0, profitPct:0, dailyProfit:0, dailyPct:0, complete:true },
  { date:'2026-09-02', value:10800, cost:10000, profit:800, profitPct:8, dailyProfit:800, dailyPct:8, complete:true },
  { date:'2026-09-03', value:10400, cost:10000, profit:400, profitPct:4, dailyProfit:-400, dailyPct:-3.7037, complete:true },
  { date:'2026-09-04', value:12000, cost:10000, profit:2000, profitPct:20, dailyProfit:1600, dailyPct:15.3846, complete:true },
  { date:'2026-09-05', value:11400, cost:10000, profit:1400, profitPct:14, dailyProfit:-600, dailyPct:-5, complete:true },
];

test('buildPremiumAnalytics separates profit types and calculates drawdown/concentration', () => {
  const result = buildPremiumAnalytics({ portfolio, history });

  assert.equal(result.realizedProfit, 700);
  assert.equal(result.unrealizedProfit, 1800);
  assert.equal(result.totalProfit, 2500);
  assert.equal(result.peakValue, 12000);
  assert.equal(Number(result.currentDrawdownPct.toFixed(2)), -5);
  assert.equal(Number(result.maxDrawdownPct.toFixed(2)), -5);
  assert.equal(result.bestDay.date, '2026-09-04');
  assert.equal(result.worstDay.date, '2026-09-05');
  assert.equal(Number(result.topHoldingSharePct.toFixed(2)), 52.54);
  assert.equal(Number(result.topThreeSharePct.toFixed(2)), 100);
  assert.deepEqual(result.holdingContributions.map(row => row.ticker), ['AAA','BBB','CCC']);
  assert.equal(result.allocationBySector.find(row => row.name === 'Teknoloji').value, 8200);
});

test('buildPremiumSeries produces metric-specific rows and drawdown values', () => {
  const valueRows = buildPremiumSeries({ history, metric:'value', range:'ALL' });
  assert.equal(valueRows.length, 5);
  assert.equal(valueRows.at(-1).y, 11400);
  assert.equal(Number(valueRows.at(-1).drawdownPct.toFixed(2)), -5);

  const drawdownRows = buildPremiumSeries({ history, metric:'drawdown', range:'ALL' });
  assert.equal(Number(drawdownRows[3].y.toFixed(2)), 0);
  assert.equal(Number(drawdownRows[4].y.toFixed(2)), -5);

  const profitRows = buildPremiumSeries({ history, metric:'profit', range:'ALL' });
  assert.equal(profitRows[3].y, 2000);

  const returnRows = buildPremiumSeries({ history, metric:'returnPct', range:'ALL' });
  assert.equal(returnRows[3].y, 20);
});

test('buildPremiumSeries clips relative ranges from the last available date without fabricating data', () => {
  const longHistory = [
    { date:'2026-07-01', value:9000, cost:10000, profit:-1000, profitPct:-10, dailyProfit:-1000, dailyPct:-10, complete:true },
    ...history,
  ];
  const month = buildPremiumSeries({ history:longHistory, metric:'value', range:'1M' });
  assert.equal(month.some(row => row.date === '2026-07-01'), false);
  assert.equal(month.at(-1).date, '2026-09-05');

  const empty = buildPremiumSeries({ history:[{ date:'2026-09-01', value:null, complete:false }], metric:'value', range:'ALL' });
  assert.deepEqual(empty, []);
});
