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
    sales: [{ lots: 4, price: 12 }], history: []
  });
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

test('makePortfolioHistory combines current active lots by date', () => {
  const history = makePortfolioHistory([
    { ticker:'AAA', ipoPrice:10, initialLots:10, currentLots:10, firstTradeDate:'2026-08-20', history:[{date:'2026-08-19',close:9},{date:'2026-08-20',close:10},{date:'2026-08-21',close:12}] },
    { ticker:'BBB', ipoPrice:20, initialLots:5, currentLots:5, firstTradeDate:'2026-08-21', history:[{date:'2026-08-21',close:21}] },
  ]);
  assert.deepEqual(history, [
    { date:'2026-08-20', value:100, cost:100, profit:0 },
    { date:'2026-08-21', value:225, cost:200, profit:25 },
  ]);
});

test('validateSale rejects selling more than current lots', () => {
  assert.throws(() => validateSale({ currentLots: 3 }, 4, 20), /mevcut lottan fazla/i);
});

test('validateSale rejects non-positive values', () => {
  assert.throws(() => validateSale({ currentLots: 3 }, 0, 20), /geçerli/i);
  assert.throws(() => validateSale({ currentLots: 3 }, 1, 0), /geçerli/i);
});
