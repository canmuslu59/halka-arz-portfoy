import test from 'node:test';
import assert from 'node:assert/strict';
import { sortHoldings, sectorBreakdown, nearestChartIndex } from '../public/core/analytics.js';

test('sortHoldings sorts numeric metrics descending and ticker alphabetically', () => {
  const rows = [
    { ticker:'BBB', dailyProfit:-10, dailyPct:-1, activeValue:200 },
    { ticker:'AAA', dailyProfit:40, dailyPct:4, activeValue:100 },
    { ticker:'CCC', dailyProfit:5, dailyPct:1, activeValue:400 },
  ];
  assert.deepEqual(sortHoldings(rows, 'dailyProfit').map(x => x.ticker), ['AAA','CCC','BBB']);
  assert.deepEqual(sortHoldings(rows, 'activeValue').map(x => x.ticker), ['CCC','BBB','AAA']);
  assert.deepEqual(sortHoldings(rows, 'ticker').map(x => x.ticker), ['AAA','BBB','CCC']);
  assert.deepEqual(rows.map(x => x.ticker), ['BBB','AAA','CCC'], 'input must not mutate');
});

test('sectorBreakdown groups current active value and calculates percentages', () => {
  const rows = [
    { sector:'Enerji', activeValue:300 },
    { sector:'Enerji', activeValue:100 },
    { sector:'GYO', activeValue:600 },
    { sector:null, activeValue:0 },
  ];
  assert.deepEqual(sectorBreakdown(rows), [
    { sector:'GYO', value:600, pct:60 },
    { sector:'Enerji', value:400, pct:40 },
  ]);
});

test('nearestChartIndex maps a pointer x coordinate to the closest history row', () => {
  assert.equal(nearestChartIndex(10, { left:10, right:110 }, 5), 0);
  assert.equal(nearestChartIndex(60, { left:10, right:110 }, 5), 2);
  assert.equal(nearestChartIndex(110, { left:10, right:110 }, 5), 4);
  assert.equal(nearestChartIndex(1000, { left:10, right:110 }, 5), 4);
});
