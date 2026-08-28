import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanTicker,
  calculateHolding,
  calculateTotals,
  makePortfolioHistory,
  validateSale,
} from '../public/core/domain.js';

test('cleanTicker normalizes BIST suffixes and punctuation', () => {
  assert.equal(cleanTicker(' kpeks.IS '), 'KPEKS');
  assert.equal(cleanTicker('abc.e'), 'ABC');
  assert.equal(cleanTicker('THY-AO'), 'THYAO');
});

test('calculateHolding separates realized and unrealized profit', () => {
  const result = calculateHolding({
    ticker: 'TEST', initialLots: 10, currentLots: 6,
    ipoPrice: 10, currentPrice: 15, previousClose: 14,
    sales: [{ lots: 4, price: 12 }], history: [], latestMarketDate:'2026-08-28'
  }, { today:'2026-08-28' });
  assert.equal(result.invested, 100);
  assert.equal(result.activeValue, 90);
  assert.equal(result.salesProceeds, 48);
  assert.equal(result.totalWealth, 138);
  assert.equal(result.realizedProfit, 8);
  assert.equal(result.unrealizedProfit, 30);
  assert.equal(result.totalProfit, 38);
  assert.equal(result.totalProfitPct, 38);
  assert.equal(result.dailyProfit, 6);
  assert.ok(Math.abs(result.dailyPct - 7.142857142857142) < 1e-9);
});

test('calculateTotals aggregates daily and total portfolio metrics', () => {
  const holdings = [
    calculateHolding({ ticker:'AAA', initialLots:10, currentLots:10, ipoPrice:10, currentPrice:12, previousClose:11, sales:[], history:[] }),
    calculateHolding({ ticker:'BBB', initialLots:5, currentLots:5, ipoPrice:20, currentPrice:18, previousClose:20, sales:[], history:[] }),
  ];
  const totals = calculateTotals(holdings);
  assert.equal(totals.invested, 200);
  assert.equal(totals.activeValue, 210);
  assert.equal(totals.totalProfit, 10);
  assert.equal(totals.dailyProfit, 0);
  assert.equal(totals.totalProfitPct, 5);
});

test('makePortfolioHistory starts each holding on IPO day and separates capital from gain', () => {
  const history = makePortfolioHistory([
    { ticker:'AAA', ipoPrice:10, initialLots:10, currentLots:10, firstTradeDate:'2026-08-20', sales:[], history:[{date:'2026-08-19',close:9},{date:'2026-08-20',close:10},{date:'2026-08-21',close:12}] },
    { ticker:'BBB', ipoPrice:20, initialLots:5, currentLots:5, firstTradeDate:'2026-08-21', sales:[], history:[{date:'2026-08-21',close:21}] },
  ]);
  assert.deepEqual(history, [
    { date:'2026-08-20', value:100, cost:100, profit:0, profitPct:0, dailyProfit:0, dailyPct:0, capitalAdded:100 },
    { date:'2026-08-21', value:225, cost:200, profit:25, profitPct:12.5, dailyProfit:25, dailyPct:12.5, capitalAdded:100 },
  ]);
});

test('makePortfolioHistory applies dated sales only from the sale date forward', () => {
  const history = makePortfolioHistory([
    {
      ticker:'AAA', ipoPrice:10, initialLots:10, currentLots:6, firstTradeDate:'2026-08-20',
      sales:[{ lots:4, price:13, date:'2026-08-22' }],
      history:[{date:'2026-08-20',close:10},{date:'2026-08-21',close:12},{date:'2026-08-22',close:14}],
    },
  ]);
  assert.equal(history[1].value, 120);
  assert.equal(history[1].profit, 20);
  assert.equal(history[2].value, 136);
  assert.equal(history[2].profit, 36);
  assert.equal(history[2].dailyProfit, 16);
  assert.ok(Math.abs(history[2].dailyPct - 13.333333333333334) < 1e-9);
});

test('calculateHolding reports zero today P/L when latest market session is not today', () => {
  const result = calculateHolding({
    ticker:'AAA', initialLots:10, currentLots:10, ipoPrice:10,
    currentPrice:15, previousClose:14, latestMarketDate:'2026-08-28', sales:[], history:[],
  }, { today:'2026-08-29' });
  assert.equal(result.dailyProfit, 0);
  assert.equal(result.dailyPct, 0);
});

test('validateSale rejects selling more than current lots', () => {
  assert.throws(() => validateSale({ currentLots: 3 }, 4, 20), /mevcut lottan fazla/i);
});

test('validateSale rejects non-positive values', () => {
  assert.throws(() => validateSale({ currentLots: 3 }, 0, 20), /geçerli/i);
  assert.throws(() => validateSale({ currentLots: 3 }, 1, 0), /geçerli/i);
});

test('calculateTotals keeps unchanged current-day holdings in daily percentage denominator', () => {
  const holdings = [
    calculateHolding({ ticker:'AAA', initialLots:10, currentLots:10, ipoPrice:10, currentPrice:11, previousClose:10, latestMarketDate:'2026-08-28', sales:[], history:[] }, {today:'2026-08-28'}),
    calculateHolding({ ticker:'BBB', initialLots:10, currentLots:10, ipoPrice:10, currentPrice:20, previousClose:20, latestMarketDate:'2026-08-28', sales:[], history:[] }, {today:'2026-08-28'}),
  ];
  const totals = calculateTotals(holdings);
  assert.equal(totals.dailyProfit, 10);
  assert.ok(Math.abs(totals.dailyPct - (10/300*100)) < 1e-9);
});
