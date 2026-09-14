import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanTicker,
  inferSectorFromCompany,
  calculateHolding,
  calculateTotals,
  makePortfolioHistory,
  validateSale,
} from '../public/core/domain.js';


test('inferSectorFromCompany classifies common Turkish listed-company names', () => {
  assert.equal(inferSectorFromCompany('Çitlekçi Mağazacılık Gıda A.Ş.', 'CITAS'), 'Gıda');
  assert.equal(inferSectorFromCompany('Örnek Teknoloji Mağazacılık A.Ş.', 'TEKNO'), 'Teknoloji');
  assert.equal(inferSectorFromCompany('Moda Giyim Mağazacılık A.Ş.', 'MODA'), 'Tekstil');
  assert.equal(inferSectorFromCompany('Adra Gayrimenkul Yatırım Ortaklığı A.Ş.', 'ADGYO'), 'GYO');
  assert.equal(inferSectorFromCompany('A1 Yenilenebilir Enerji Üretim A.Ş.', 'A1YEN'), 'Enerji');
});

test('cleanTicker normalizes BIST suffixes and punctuation', () => {
  assert.equal(cleanTicker(' kpeks.IS '), 'KPEKS');
  assert.equal(cleanTicker('abc.e'), 'ABC');
  assert.equal(cleanTicker('THY-AO'), 'THYAO');
});

test('calculateHolding deducts 17.5 percent withholding only from positive realized sale gains', () => {
  const result = calculateHolding({
    ticker: 'TEST', initialLots: 10, currentLots: 6,
    ipoPrice: 10, currentPrice: 15, previousClose: 14,
    sales: [{ lots: 4, price: 12 }], history: [], latestMarketDate:'2026-08-28'
  }, { today:'2026-08-28' });
  assert.equal(result.invested, 100);
  assert.equal(result.activeValue, 90);
  assert.equal(result.grossSalesProceeds, 48);
  assert.ok(Math.abs(result.withholdingTax - 1.4) < 1e-9);
  assert.ok(Math.abs(result.salesProceeds - 46.6) < 1e-9);
  assert.equal(result.grossRealizedProfit, 8);
  assert.ok(Math.abs(result.realizedProfit - 6.6) < 1e-9);
  assert.equal(result.unrealizedProfit, 30);
  assert.ok(Math.abs(result.totalProfit - 36.6) < 1e-9);
  assert.ok(Math.abs(result.totalProfitPct - 36.6) < 1e-9);
  assert.equal(result.dailyProfit, 6);
  assert.ok(Math.abs(result.dailyPct - 7.142857142857142) < 1e-9);
});

test('calculateHolding applies no withholding to a realized loss and none to an unsold position', () => {
  const loss = calculateHolding({
    ticker:'LOSS', initialLots:10, currentLots:5, ipoPrice:10,
    currentPrice:9, previousClose:9, sales:[{lots:5, price:8}], history:[],
  });
  assert.equal(loss.withholdingTax, 0);
  assert.equal(loss.grossSalesProceeds, 40);
  assert.equal(loss.salesProceeds, 40);
  assert.equal(loss.grossRealizedProfit, -10);
  assert.equal(loss.realizedProfit, -10);

  const unsold = calculateHolding({
    ticker:'OPEN', initialLots:10, currentLots:10, ipoPrice:10,
    currentPrice:15, previousClose:14, sales:[], history:[],
  });
  assert.equal(unsold.withholdingTax, 0);
  assert.equal(unsold.grossRealizedProfit, 0);
  assert.equal(unsold.realizedProfit, 0);
  assert.equal(unsold.unrealizedProfit, 50);
});

test('sale-day daily percentage uses start-of-day lots and net wealth after withholding', () => {
  const result = calculateHolding({
    ticker:'SALE', initialLots:100, currentLots:50, ipoPrice:5,
    currentPrice:11, previousClose:10, latestMarketDate:'2026-09-14',
    sales:[{ lots:50, price:12, date:'2026-09-14' }], history:[],
  }, { today:'2026-09-14' });
  assert.equal(result.dailyBaseLots, 100);
  assert.ok(Math.abs(result.withholdingTax - 61.25) < 1e-9);
  assert.ok(Math.abs(result.dailyProfit - 88.75) < 1e-9);
  assert.ok(Math.abs(result.dailyPct - 8.875) < 1e-9);
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
    { date:'2026-08-20', value:100, cost:100, profit:0, profitPct:0, dailyProfit:0, dailyPct:0, capitalAdded:100, complete:true },
    { date:'2026-08-21', value:225, cost:200, profit:25, profitPct:12.5, dailyProfit:25, dailyPct:12.5, capitalAdded:100, complete:true },
  ]);
});

test('makePortfolioHistory applies dated sales and withholding only from the sale date forward', () => {
  const history = makePortfolioHistory([
    {
      ticker:'AAA', ipoPrice:10, initialLots:10, currentLots:6, firstTradeDate:'2026-08-20',
      sales:[{ lots:4, price:13, date:'2026-08-22' }],
      history:[{date:'2026-08-20',close:10},{date:'2026-08-21',close:12},{date:'2026-08-22',close:14}],
    },
  ]);
  assert.equal(history[1].value, 120);
  assert.equal(history[1].profit, 20);
  assert.ok(Math.abs(history[2].value - 133.9) < 1e-9);
  assert.ok(Math.abs(history[2].profit - 33.9) < 1e-9);
  assert.ok(Math.abs(history[2].dailyProfit - 13.9) < 1e-9);
  assert.ok(Math.abs(history[2].dailyPct - (13.9/120*100)) < 1e-9);
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
