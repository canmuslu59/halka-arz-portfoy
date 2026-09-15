import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { PREMIUM_SECTIONS, buildPremiumHomeModel, premiumMembershipModel } from '../public/premium-demo.js';

const portfolio = {
  totals:{ totalWealth:128532, invested:98215, activeValue:120000, salesProceeds:8532, realizedProfit:7200, unrealizedProfit:23117, totalProfit:30317, dailyProfit:4328, dailyPct:3.48, totalProfitPct:30.86 },
  holdings:[
    { ticker:'ASELS', sector:'Savunma', activeValue:42000, invested:25000, realizedProfit:1000, unrealizedProfit:9000, totalProfit:10000, dailyProfit:1200 },
    { ticker:'KCHOL', sector:'Holding', activeValue:36000, invested:32000, realizedProfit:2000, unrealizedProfit:4000, totalProfit:6000, dailyProfit:900 },
    { ticker:'THYAO', sector:'Ulaştırma', activeValue:30000, invested:28000, realizedProfit:1000, unrealizedProfit:2000, totalProfit:3000, dailyProfit:-500 },
  ],
};
const history = [
  { date:'2026-09-13', value:120000, profit:21785, profitPct:22.2, dailyProfit:1000, dailyPct:.84, complete:true },
  { date:'2026-09-14', value:124204, profit:25989, profitPct:26.46, dailyProfit:4204, dailyPct:3.5, complete:true },
  { date:'2026-09-15', value:128532, profit:30317, profitPct:30.86, dailyProfit:4328, dailyPct:3.48, complete:true },
];

test('premium demo exposes the full paid experience as internal sections, not a second bottom navigation', () => {
  assert.deepEqual(PREMIUM_SECTIONS.map(item => item.id), [
    'home','analytics','charts','alerts','ipo','watchlist','backup','membership',
  ]);
  const source = fs.readFileSync(new URL('../public/premium-demo.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /class=["']bottom-nav/);
});

test('premium home model derives value/insights from real portfolio data', () => {
  const model = buildPremiumHomeModel({ portfolio, history });
  assert.equal(model.totalWealth, 128532);
  assert.equal(model.dailyProfit, 4328);
  assert.equal(model.totalProfit, 30317);
  assert.equal(model.strongest.ticker, 'ASELS');
  assert.equal(model.weakest.ticker, 'THYAO');
  assert.ok(model.insights.length >= 3);
});

test('membership model clearly marks prices and entitlement as demo-only', () => {
  const model = premiumMembershipModel();
  assert.equal(model.demo, true);
  assert.match(model.monthly.label, /örnek/i);
  assert.match(model.yearly.label, /örnek/i);
  assert.match(model.cta, /test sürümünde premium açık/i);
});
