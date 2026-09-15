import test from 'node:test';
import assert from 'node:assert/strict';

import { buildChartGeometry, nearestChartPoint } from '../public/premium-charts.js';

const rows = [
  { date:'2026-09-01', y:-100, value:9900, profit:-100, profitPct:-1, dailyProfit:-100, dailyPct:-1, drawdownPct:-1 },
  { date:'2026-09-02', y:250, value:10250, profit:250, profitPct:2.5, dailyProfit:350, dailyPct:3.54, drawdownPct:0 },
  { date:'2026-09-03', y:100, value:10100, profit:100, profitPct:1, dailyProfit:-150, dailyPct:-1.46, drawdownPct:-1.46 },
  { date:'2026-09-04', y:600, value:10600, profit:600, profitPct:6, dailyProfit:500, dailyPct:4.95, drawdownPct:0 },
];

test('premium chart geometry identifies extrema and a zero reference for mixed P/L data', () => {
  const geometry = buildChartGeometry(rows, { width:320, height:220, padding:{ left:42, right:12, top:18, bottom:28 } });
  assert.equal(geometry.points.length, 4);
  assert.equal(geometry.minPoint.index, 0);
  assert.equal(geometry.maxPoint.index, 3);
  assert.ok(geometry.zeroY > geometry.plotTop);
  assert.ok(geometry.zeroY < geometry.plotBottom);
  assert.equal(geometry.plotLeft, 42);
  assert.equal(geometry.plotRight, 308);
});

test('nearestChartPoint resolves touch position without depending on Array.at/findLast APIs', () => {
  const geometry = buildChartGeometry(rows, { width:300, height:180 });
  const target = geometry.points[2];
  const picked = nearestChartPoint(geometry, target.x + 2);
  assert.equal(picked.index, 2);
  assert.equal(picked.row.date, '2026-09-03');
});

test('premium chart geometry gracefully handles one point and empty data', () => {
  const single = buildChartGeometry([rows[0]], { width:300, height:180 });
  assert.equal(single.points.length, 1);
  assert.equal(single.minPoint.index, 0);
  assert.equal(single.maxPoint.index, 0);

  const empty = buildChartGeometry([], { width:300, height:180 });
  assert.deepEqual(empty.points, []);
  assert.equal(nearestChartPoint(empty, 100), null);
});
