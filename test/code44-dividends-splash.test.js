import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYahooChart } from '../android/app/src/main/assets/www/core/parsers.js';
import {
  dividendWithholdingRate, lotsEntitledOn, splitFactorAfter, holdingDividendPayments, holdingDividendSummary, summarizeDividends,
} from '../android/app/src/main/assets/www/core/dividends.js';
import { createRepository } from '../android/app/src/main/assets/www/core/repository.js';
import { createPortfolioService } from '../android/app/src/main/assets/www/core/portfolio-service.js';

const text = rel => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const epoch = iso => Date.parse(`${iso}T07:00:00Z`) / 1000;

test('Yahoo chart parser keeps dividend and split events from the same history request', () => {
  const json = { chart:{ result:[{
    meta:{ exchangeTimezoneName:'Europe/Istanbul', regularMarketPrice:21, previousClose:20, regularMarketTime:epoch('2026-06-16') },
    timestamp:[epoch('2026-06-15'), epoch('2026-06-16')],
    indicators:{ quote:[{ close:[20, 21] }] },
    events:{
      dividends:{ a:{ amount:1.25, date:epoch('2026-06-15') }, b:{ amount:0, date:epoch('2026-06-16') } },
      splits:{ c:{ numerator:2, denominator:1, date:epoch('2025-09-01') } },
    },
  }] } };
  const parsed = parseYahooChart(json, 'TEST');
  assert.deepEqual(parsed.dividends, [{ date:'2026-06-15', amount:1.25 }]);
  assert.deepEqual(parsed.splits, [{ date:'2025-09-01', numerator:2, denominator:1 }]);
  assert.deepEqual(parseYahooChart({ chart:{ result:[{ meta:{}, timestamp:[], indicators:{ quote:[{}] } }] } }, 'TEST').dividends, []);
});

test('dividend entitlement uses lots held at the end of the day before the ex-date', () => {
  const holding = {
    id:'h1', ticker:'TEST', currentLots:11, currentPrice:20,
    purchases:[{ lots:10, price:5, date:'2026-01-05' }, { lots:5, price:6, date:'2026-03-10' }],
    sales:[{ lots:4, price:7, date:'2026-03-10' }],
    historySnapshot:{ dividends:[{ date:'2026-03-10', amount:2 }], splits:[] },
  };
  // Hak günü alınan 5 lot temettü almaz, hak günü satılan 4 lot alır.
  assert.equal(lotsEntitledOn(holding, '2026-03-10'), 10);
  assert.equal(lotsEntitledOn(holding, '2026-01-05'), 0);
  const [payment] = holdingDividendPayments(holding, { today:'2026-10-19' });
  assert.equal(payment.lots, 10);
  close(payment.gross, 20);
  close(payment.tax, 3);
  close(payment.net, 17);
});

test('withholding follows the 22.12.2024 rate change and split factors count only later splits', () => {
  assert.equal(dividendWithholdingRate('2024-12-21'), 0.10);
  assert.equal(dividendWithholdingRate('2024-12-22'), 0.15);
  const splits = [{ date:'2025-09-01', numerator:2, denominator:1 }, { date:'2026-02-01', numerator:3, denominator:2 }];
  close(splitFactorAfter(splits, '2025-06-10'), 3);
  close(splitFactorAfter(splits, '2025-12-01'), 1.5);
  close(splitFactorAfter(splits, '2026-02-01'), 1);
});

test('portfolio summary totals, yearly rows, trailing yield and expected annual income', () => {
  const holdings = [{
    id:'h1', ticker:'AAAA', currentLots:100, currentPrice:20, activeValue:2000,
    purchases:[{ lots:100, price:10, date:'2024-03-01' }], sales:[],
    historySnapshot:{
      dividends:[{ date:'2024-06-10', amount:0.25 }, { date:'2025-06-10', amount:0.5 }, { date:'2026-06-15', amount:1 }],
      splits:[{ date:'2025-09-01', numerator:2, denominator:1 }],
    },
  }, {
    id:'h2', ticker:'BBBB', currentLots:0, currentPrice:5, activeValue:0,
    purchases:[{ lots:50, price:4, date:'2026-01-02' }], sales:[{ lots:50, price:6, date:'2026-05-01' }],
    historySnapshot:{ dividends:[{ date:'2026-07-01', amount:3 }], splits:[] },
  }];
  const summary = summarizeDividends(holdings, { today:'2026-10-19' });
  // Lotlar bugünkü (bedelsiz sonrası) adette; Yahoo tutarı da düzeltilmiş → doğrudan çarpılır.
  // 2024-06-10: 0.25 ×100 = 25, %10 → 22.5 net (ilan edilen 0.5/hisse)
  // 2025-06-10: 0.5 ×100 = 50, %15 → 42.5 net (ilan edilen 1/hisse)
  // 2026-06-15: 1 ×100 = 100, %15 → 85 net. BBBB hak gününde lotsuz.
  assert.equal(summary.count, 3);
  close(summary.totalGross, 175);
  close(summary.totalTax, 25);
  close(summary.totalNet, 150);
  close(summary.yearNet, 85);
  close(summary.ttmNet, 85);
  assert.deepEqual(summary.byYear.map(row => [row.year, row.net.toFixed(2)]), [['2024', '22.50'], ['2025', '42.50'], ['2026', '85.00']]);
  const first = summary.payments.find(payment => payment.date === '2024-06-10');
  close(first.perShare, 0.5);
  close(first.adjustedPerShare, 0.25);
  assert.equal(first.splitFactor, 2);
  close(summary.expectedAnnualNet, 85);
  close(summary.yieldPct, 5);
  assert.deepEqual(summary.holdings.map(item => item.ticker), ['AAAA', 'BBBB']);
  assert.equal(summary.holdings[1].count, 0);
  close(summary.holdings[1].ttmYieldPct, 60);
  assert.equal(summary.payments[0].date, '2026-06-15');
});

test('manual dividend replaces the automatic record of the same day and hidden records are skipped', () => {
  const base = {
    id:'h1', ticker:'TEST', currentLots:10, currentPrice:10,
    purchases:[{ lots:10, price:5, date:'2026-01-05' }], sales:[],
    historySnapshot:{ dividends:[{ date:'2026-03-10', amount:2 }, { date:'2026-04-10', amount:1 }], splits:[] },
  };
  const manual = holdingDividendPayments({ ...base, manualDividends:[{ id:'m1', date:'2026-03-10', perShare:2.5 }] }, { today:'2026-10-19' });
  assert.deepEqual(manual.map(p => [p.date, p.source, p.perShare]), [['2026-04-10', 'auto', 1], ['2026-03-10', 'manual', 2.5]]);
  const hidden = holdingDividendSummary({ ...base, hiddenDividends:['auto:2026-03-10'] }, { today:'2026-10-19' });
  assert.equal(hidden.count, 1);
  assert.equal(hidden.hiddenCount, 1);
});

test('manual announced amount before a bedelsiz is converted to today lot units', () => {
  // Gerçek Test Lab verisi kalıbı: TUPRS 2023-04-04 7:1 bedelsiz, 2023-03-10 ilan 45,41 TL/hisse.
  const holding = {
    id:'h1', ticker:'TUPRS', currentLots:100, currentPrice:356.75,
    purchases:[{ lots:100, price:90, date:'2023-01-03' }], sales:[],
    historySnapshot:{ dividends:[{ date:'2023-03-10', amount:6.487455 }], splits:[{ date:'2023-04-04', numerator:700, denominator:100 }] },
  };
  const [auto] = holdingDividendPayments(holding, { today:'2026-10-19' });
  close(auto.perShare, 45.412185);
  close(auto.gross, 648.7455);
  const [manual] = holdingDividendPayments({ ...holding, manualDividends:[{ id:'m1', date:'2023-03-10', perShare:45.412185 }] }, { today:'2026-10-19' });
  assert.equal(manual.source, 'manual');
  close(manual.adjustedPerShare, 6.487455);
  close(manual.gross, 648.7455);
});

function memoryRepository() {
  let raw = null;
  return {
    repository:createRepository({ get: async () => raw, set: async value => { raw = value; } }),
    read: () => JSON.parse(raw),
    write: value => { raw = JSON.stringify(value); },
  };
}

function serviceFixture() {
  const memory = memoryRepository();
  let historyCalls = 0;
  let ids = 0;
  const service = createPortfolioService({
    repository:memory.repository,
    getQuote: async () => ({ ticker:'TEST', current:20, previousClose:19, marketTime:'2026-10-19T09:00:00.000Z', history:[{ date:'2026-10-19', close:20 }] }),
    getHistory: async () => {
      historyCalls += 1;
      return { history:[{ date:'2026-01-05', close:5 }, { date:'2026-10-16', close:19 }], dividends:[{ date:'2026-06-15', amount:1 }], splits:[] };
    },
    getIpo: async () => ({ ticker:'TEST', company:'Test AŞ', ipoPrice:null, firstTradeDate:null }),
    getSector: async () => ({ ticker:'TEST', sector:'Enerji', source:'test' }),
    now: () => new Date('2026-10-19T10:00:00.000Z'),
    uuid: () => `id-${++ids}`,
  });
  return { service, memory, historyCalls:() => historyCalls };
}

test('history refresh stores dividends once and refetches legacy snapshots without dividends', async () => {
  const { service, memory, historyCalls } = serviceFixture();
  const { holding } = await service.addHolding({ ticker:'TEST', lots:10, ipoPriceOverride:5, firstTradeDateOverride:'2026-01-05' });
  assert.equal(historyCalls(), 1);
  assert.deepEqual(memory.read().holdings[0].historySnapshot.dividends, [{ date:'2026-06-15', amount:1 }]);

  await service.refreshHistory();
  assert.equal(historyCalls(), 1, 'fresh snapshot with dividends is not downloaded again');

  const data = memory.read();
  delete data.holdings[0].historySnapshot.dividends;
  memory.write(data);
  const refreshed = await service.refreshHistory();
  assert.equal(historyCalls(), 2, 'Code43 snapshot without dividends is downloaded once');
  const summary = summarizeDividends(refreshed.holdings, { today:'2026-10-19' });
  close(summary.totalNet, 8.5);
  assert.equal(refreshed.holdings[0].id, holding.id);
});

test('manual dividend records validate, hide automatic ones and restore them', async () => {
  const { service, memory } = serviceFixture();
  const { holding } = await service.addHolding({ ticker:'TEST', lots:10, ipoPriceOverride:5, firstTradeDateOverride:'2026-01-05' });
  await assert.rejects(() => service.addManualDividend(holding.id, { date:'2026-01-05', perShare:1 }), /lot görünmüyor/);
  await assert.rejects(() => service.addManualDividend(holding.id, { date:'2026-12-01', perShare:1 }), /gelecekte/);
  await assert.rejects(() => service.addManualDividend(holding.id, { date:'2026-08-01', perShare:0 }), /0’dan büyük/);

  const added = await service.addManualDividend(holding.id, { date:'2026-08-01', perShare:0.75 });
  assert.equal(holdingDividendSummary(added, { today:'2026-10-19' }).count, 2);
  const manualId = memory.read().holdings[0].manualDividends[0].id;

  const hidden = await service.removeDividend(holding.id, 'auto:2026-06-15');
  assert.deepEqual(memory.read().holdings[0].hiddenDividends, ['auto:2026-06-15']);
  assert.equal(holdingDividendSummary(hidden, { today:'2026-10-19' }).count, 1);

  const restored = await service.restoreHiddenDividends(holding.id);
  assert.equal(holdingDividendSummary(restored, { today:'2026-10-19' }).count, 2);

  const removed = await service.removeDividend(holding.id, manualId);
  assert.equal(holdingDividendSummary(removed, { today:'2026-10-19' }).count, 1);
  await assert.rejects(() => service.removeDividend(holding.id, 'missing'), /bulunamadı/);
});

test('splash stays up while startup prices are calculated and is lifted by the web layer', () => {
  const activity = text('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  const app = text('android/app/src/main/assets/www/app.js');
  const themeV31 = text('android/app/src/main/res/values-v31/themes.xml');
  assert.match(activity, /setContentView\(root\);\s*showSplash\(true\);/);
  assert.match(activity, /@JavascriptInterface\s+public void hideSplash\(\)/);
  assert.match(activity, /@JavascriptInterface\s+public void setResumeSplashEnabled\(boolean enabled\)/);
  assert.match(activity, /SPLASH_FAILSAFE_MS = 10000L/);
  assert.match(activity, /RESUME_SPLASH_AFTER_MS = 30000L/);
  assert.match(activity, /window\.__appResumeRefresh/);
  assert.match(activity, /startupPromptsPending[\s\S]*postDelayed\(startupPermissionRequest,\s*700L\)[\s\S]*postDelayed\(startupWidgetPrompt,\s*2200L\)/);
  assert.match(activity, /R\.drawable\.ic_launcher/);
  // Web katmanı kurulamazsa (eski WebView sözdizimi hatası) logo 10 sn beklemez.
  assert.match(activity, /deliverWalletWidgetPromo\(\);\s*releaseSplashIfWebAppFailed\(\);/);
  assert.match(activity, /typeof window\.__appResumeRefresh === 'function'[\s\S]{0,120}hideSplash\(true\)/);
  assert.match(activity, /if\(document\.documentElement\)\{/);
  assert.match(app, /settleBehindSplash\(\[\s*loadPortfolio\(\)\.then\(\(\) => refreshBackgroundHistory\(\)\),\s*loadHomeComparison\(\),\s*\]/);
  assert.match(app, /window\.AndroidBridge\?\.hideSplash\?\.\(\)/);
  assert.match(app, /window\.__appResumeRefresh = \(\) =>/);
  assert.match(app, /SPLASH_STARTUP_MAX_WAIT_MS = 8000/);
  assert.match(themeV31, /windowSplashScreenBackground">#070B15</);
});

test('dividend screen is reachable from the wallet without changing the five-item dock', () => {
  const index = text('android/app/src/main/assets/www/index.html');
  const app = text('android/app/src/main/assets/www/app.js');
  assert.match(index, /id="dividendHomeCard"/);
  assert.match(index, /id="dividendsView" class="app-view dividends-view" hidden/);
  assert.equal((index.match(/class="nav-tab/g) || []).length, 5);
  assert.match(app, /dividends: \{ title:'Temettü' \}/);
  assert.match(app, /\$\('#dividendHomeOpen'\)\?\.addEventListener\('click', \(\) => switchView\('dividends'\)\)/);
});
