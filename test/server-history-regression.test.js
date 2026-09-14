import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function serverSource() {
  return readFile(new URL('../server.js', import.meta.url), 'utf8');
}

async function loadServerHistoryFunction() {
  const source = await serverSource();
  const start = source.indexOf('function makePortfolioHistory(holdings)');
  const end = source.indexOf('\nfunction json(', start);
  assert.ok(start >= 0 && end > start, 'server makePortfolioHistory function must remain discoverable');
  const body = source.slice(start, end);
  return Function(`"use strict"; const WITHHOLDING_RATE=0.175; function saleWithholding(quantity,price,cost){ const q=Number(quantity),p=Number(price),c=Number(cost); if(!(q>0)||!(p>0)||!(c>0)) return 0; return Math.max(0,q*(p-c))*WITHHOLDING_RATE; } ${body}; return makePortfolioHistory;`)();
}

async function loadHydrateHoldingFunction({ market, ipo }) {
  const source = await serverSource();
  const start = source.indexOf('async function hydrateHolding(h)');
  const end = source.indexOf('\nfunction makePortfolioHistory', start);
  assert.ok(start >= 0 && end > start, 'server hydrateHolding function must remain discoverable');
  const body = source.slice(start, end);
  return Function('fetchMarket','fetchIpo', `
    "use strict";
    const WITHHOLDING_RATE=0.175;
    function cleanTicker(value){return String(value||'').toUpperCase().replace(/\\.IS$/i,'').replace(/\\.E$/i,'').replace(/[^A-Z0-9]/g,'').slice(0,8);}
    function profitPct(profit,cost){return cost>0?(profit/cost)*100:0;}
    function saleWithholding(quantity,price,cost){
      const q=Number(quantity),p=Number(price),c=Number(cost);
      if(!(q>0)||!(p>0)||!(c>0)) return 0;
      return Math.max(0,q*(p-c))*WITHHOLDING_RATE;
    }
    ${body};
    return hydrateHolding;
  `)(async()=>market, async()=>ipo);
}

test('server portfolio history keeps pre-sale lots intact and applies net sale proceeds from sale date forward', async () => {
  const makePortfolioHistory = await loadServerHistoryFunction();
  const history = makePortfolioHistory([{
    ticker:'AAA',
    ipoPrice:10,
    initialLots:100,
    currentLots:50,
    firstTradeDate:'2026-09-01',
    sales:[{ lots:50, price:11, date:'2026-09-03' }],
    history:[
      { date:'2026-09-01', close:10 },
      { date:'2026-09-02', close:12 },
      { date:'2026-09-03', close:11 },
    ],
  }]);

  assert.deepEqual(history.map(row => ({ date:row.date, value:row.value, cost:row.cost, profit:row.profit })), [
    { date:'2026-09-01', value:1000, cost:1000, profit:0 },
    { date:'2026-09-02', value:1200, cost:1000, profit:200 },
    { date:'2026-09-03', value:1091.25, cost:1000, profit:91.25 },
  ]);
});

test('legacy server deducts 17.5% withholding only from profitable realized sales', async () => {
  const hydrateHolding = await loadHydrateHoldingFunction({
    market:{ current:15, previousClose:14, marketTime:'2026-09-14T10:00:00Z', history:[] },
    ipo:{ ticker:'AAA', company:'AAA AŞ', ipoPrice:10, firstTradeDate:'2026-09-01', offerDates:null, source:'Test' },
  });

  const profitable = await hydrateHolding({
    ticker:'AAA', initialLots:100, currentLots:50,
    sales:[{ lots:50, price:20, date:'2026-09-14' }],
  });
  assert.equal(profitable.grossSalesProceeds, 1000);
  assert.equal(profitable.withholdingTax, 87.5);
  assert.equal(profitable.salesProceeds, 912.5);
  assert.equal(profitable.grossRealizedProfit, 500);
  assert.equal(profitable.realizedProfit, 412.5);
  assert.equal(profitable.totalWealth, 1662.5);
  assert.equal(profitable.totalProfit, 662.5);

  const loss = await hydrateHolding({
    ticker:'AAA', initialLots:100, currentLots:50,
    sales:[{ lots:50, price:8, date:'2026-09-14' }],
  });
  assert.equal(loss.withholdingTax, 0);
  assert.equal(loss.salesProceeds, 400);
  assert.equal(loss.realizedProfit, -100);
});
