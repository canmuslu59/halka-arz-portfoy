import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHolding } from '../public/core/domain.js';
import { createPortfolioService } from '../public/core/portfolio-service.js';

function memoryRepository(seed) {
  let state = structuredClone(seed);
  return {
    async load() { return structuredClone(state); },
    async save(next) { state = structuredClone(next); return structuredClone(state); },
  };
}

test('calculateHolding keeps missing market prices null instead of fabricating a zero-price loss', () => {
  const holding = calculateHolding({
    ticker:'AAA', initialLots:10, currentLots:10, ipoPrice:10,
    currentPrice:null, previousClose:null, latestMarketDate:null,
    sales:[], history:[],
  }, { today:'2026-09-10' });

  assert.equal(holding.currentPrice, null);
  assert.equal(holding.previousClose, null);
  assert.equal(holding.activeValue, null);
  assert.equal(holding.unrealizedProfit, null);
  assert.equal(holding.totalProfit, null);
  assert.equal(holding.dailyProfit, null);
  assert.equal(holding.dailyPct, null);
});

test('portfolio hydration keeps null quote fields null', async () => {
  const repository = memoryRepository({ holdings:[{
    id:'h1', ticker:'AAA', initialLots:10, currentLots:10,
    ipoPriceOverride:10, firstTradeDateOverride:null, sales:[],
    quoteSnapshot:{ current:null, previousClose:null, marketTime:null, history:[], fetchedAt:'2026-09-10T09:00:00Z' },
    historySnapshot:{ history:[], fetchedAt:'2026-09-10T09:00:00Z', fetchedLocalDate:'2026-09-10', startDate:null },
    ipoSnapshot:null, sectorSnapshot:null,
  }] });
  const service = createPortfolioService({
    repository,
    getQuote:async()=>({ current:null, previousClose:null, history:[] }),
    getHistory:async()=>({ history:[] }),
    getIpo:async()=>null,
    getSector:async()=>({ sector:null }),
    now:()=>new Date('2026-09-10T10:00:00Z'),
  });

  const portfolio = await service.getPortfolio({ refresh:false });
  const holding = portfolio.holdings[0];
  assert.equal(holding.currentPrice, null);
  assert.equal(holding.previousClose, null);
  assert.equal(holding.activeValue, null);
  assert.equal(holding.unrealizedProfit, null);
  assert.equal(holding.totalProfit, null);
});