import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { BOTTOM_NAV, ROUTES } from '../public/premium-app/router.js';
import { buildPremiumAnalytics } from '../public/core/premium-analytics.js';

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

test('Premium owns an independent five-destination navigation tree', () => {
  assert.deepEqual(BOTTOM_NAV.map(item => item.id), ['home','analytics','alerts','ipo','menu']);
  for (const route of ['watchlist','calendar','backup','membership','alert-editor','ipo-detail']) assert.ok(ROUTES[route]);
  const source = fs.readFileSync(new URL('../public/premium-app/index.js', import.meta.url), 'utf8');
  assert.match(source, /premium-bottom-nav/);
  assert.match(source, /premium-mini-shell/);
});

test('Premium analytics derives values and contribution order from real portfolio data', () => {
  const model = buildPremiumAnalytics({ portfolio, history });
  assert.equal(model.dailyProfit, 4328);
  assert.equal(model.totalProfit, 30317);
  assert.equal(model.holdingContributions[0].ticker, 'ASELS');
  assert.equal(model.holdingContributions.at(-1).ticker, 'THYAO');
  assert.equal(model.allocationByHolding[0].ticker, 'ASELS');
});

test('legacy controller is a thin adapter and no longer renders old Premium sections', () => {
  const adapter = fs.readFileSync(new URL('../public/premium-demo.js', import.meta.url), 'utf8');
  assert.match(adapter, /createPremiumApp/);
  assert.doesNotMatch(adapter, /PREMIUM_SECTIONS|renderChartsSection|premium-tab-list/);
});

test('membership remains explicitly test-only with the requested example offer', () => {
  const source = fs.readFileSync(new URL('../public/premium-app/index.js', import.meta.url), 'utf8');
  assert.match(source, /Premium Test Aktif/);
  assert.match(source, /₺49,99/);
  assert.match(source, /₺299,99/);
  assert.match(source, /%40 avantaj/i);
  assert.match(source, /gerçek satın alma veya Play Billing işlemi yapılmaz/i);
  assert.doesNotMatch(source, /data-action=["']purchase["']/i);
  assert.doesNotMatch(source, />\s*Satın Al\s*</i);
  assert.doesNotMatch(source, /(?:function\s+purchase|\.purchase\s*\(|purchase\s*\()/i);
});
