import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../public/core/repository.js';
import { createPortfolioService } from '../public/core/portfolio-service.js';

function memoryRepository() {
  let raw = null;
  return createRepository({ get: async () => raw, set: async value => { raw = value; } });
}

function market(price = 15, previous = 14) {
  return {
    ticker: 'TEST', symbol: 'TEST.IS', current: price, previousClose: previous,
    marketTime: '2026-08-28T09:00:00.000Z',
    history: [{ date:'2026-08-27', close:previous }, { date:'2026-08-28', close:price }],
  };
}

function ipo(price = 10) {
  return { ticker:'TEST', company:'Test AŞ', ipoPrice:price, firstTradeDate:'2026-08-20', offerDates:'18-19 Ağustos 2026', source:'Ahlatcı Yatırım' };
}

test('addHolding validates market ticker, persists snapshots and calculates profit', async () => {
  const service = createPortfolioService({
    repository: memoryRepository(),
    getMarket: async () => market(),
    getIpo: async () => ipo(),
    now: () => new Date('2026-08-28T10:00:00.000Z'),
    uuid: () => 'holding-1',
  });
  const added = await service.addHolding({ ticker:'test.is', lots:10 });
  assert.equal(added.autoIpoFound, true);
  assert.equal(added.holding.ticker, 'TEST');
  assert.equal(added.holding.ipoPrice, 10);
  assert.equal(added.holding.currentPrice, 15);
  assert.equal(added.holding.totalProfit, 50);
  const portfolio = await service.getPortfolio({ refresh:false });
  assert.equal(portfolio.holdings.length, 1);
  assert.equal(portfolio.totals.totalProfit, 50);
});

test('addHolding rejects duplicate tickers', async () => {
  const service = createPortfolioService({
    repository: memoryRepository(), getMarket: async () => market(), getIpo: async () => ipo(),
    now: () => new Date('2026-08-28T10:00:00.000Z'), uuid: (() => { let i=0; return () => `id-${++i}`; })(),
  });
  await service.addHolding({ ticker:'TEST', lots:2 });
  await assert.rejects(() => service.addHolding({ ticker:'test.is', lots:3 }), /zaten portföyde/i);
});

test('addSale updates current lots and realized profit', async () => {
  const service = createPortfolioService({
    repository: memoryRepository(), getMarket: async () => market(), getIpo: async () => ipo(),
    now: () => new Date('2026-08-28T10:00:00.000Z'), uuid: (() => { let i=0; return () => `id-${++i}`; })(),
  });
  const { holding } = await service.addHolding({ ticker:'TEST', lots:10 });
  const sold = await service.addSale(holding.id, { lots:4, price:12, date:'2026-08-28' });
  assert.equal(sold.currentLots, 6);
  assert.equal(sold.realizedProfit, 8);
  assert.equal(sold.totalProfit, 38);
});

test('network failure keeps last market snapshot and adds warning', async () => {
  let fail = false;
  const service = createPortfolioService({
    repository: memoryRepository(),
    getMarket: async () => { if (fail) throw new Error('Ağ yok'); return market(); },
    getIpo: async () => ipo(),
    now: () => new Date('2026-08-28T10:00:00.000Z'), uuid: () => 'holding-1',
  });
  await service.addHolding({ ticker:'TEST', lots:10 });
  fail = true;
  const portfolio = await service.getPortfolio({ refresh:true, force:true });
  assert.equal(portfolio.holdings[0].currentPrice, 15);
  assert.match(portfolio.holdings[0].errors.market, /Ağ yok/);
});

test('manual IPO override takes precedence over fetched IPO', async () => {
  const service = createPortfolioService({
    repository: memoryRepository(), getMarket: async () => market(), getIpo: async () => ipo(10),
    now: () => new Date('2026-08-28T10:00:00.000Z'), uuid: () => 'holding-1',
  });
  const { holding } = await service.addHolding({ ticker:'TEST', lots:10 });
  const updated = await service.updateHolding(holding.id, { ipoPriceOverride:12, firstTradeDateOverride:'2026-08-21' });
  assert.equal(updated.ipoPrice, 12);
  assert.equal(updated.firstTradeDate, '2026-08-21');
  assert.equal(updated.totalProfit, 30);
});

test('addHolding loads long history from IPO first trade date and caches sector', async () => {
  let historyStart = null;
  let sectorCalls = 0;
  const service = createPortfolioService({
    repository: memoryRepository(),
    getQuote: async () => market(),
    getHistory: async (_ticker, start) => { historyStart = start; return market(); },
    getIpo: async () => ipo(),
    getSector: async () => { sectorCalls += 1; return { ticker:'TEST', sector:'Enerji', source:'Fintables' }; },
    now: () => new Date('2026-08-28T10:00:00.000Z'), uuid: () => 'holding-1',
  });
  const { holding } = await service.addHolding({ ticker:'TEST', lots:10 });
  assert.equal(historyStart, '2026-08-20');
  assert.equal(holding.sector, 'Enerji');
  assert.equal(sectorCalls, 1);
});

test('normal portfolio refresh only refreshes lightweight quote and does not repeat static IPO sector or history', async () => {
  let nowValue = new Date('2026-08-28T10:00:00.000Z');
  const calls = { quote:0, history:0, ipo:0, sector:0 };
  const service = createPortfolioService({
    repository: memoryRepository(),
    getQuote: async () => { calls.quote += 1; return market(); },
    getHistory: async () => { calls.history += 1; return market(); },
    getIpo: async () => { calls.ipo += 1; return ipo(); },
    getSector: async () => { calls.sector += 1; return { ticker:'TEST', sector:'Enerji' }; },
    now: () => nowValue, uuid: () => 'holding-1',
  });
  await service.addHolding({ ticker:'TEST', lots:10 });
  const afterAdd = { ...calls };
  nowValue = new Date('2026-08-28T10:02:00.000Z');
  await service.getPortfolio({ refresh:true });
  assert.equal(calls.quote, afterAdd.quote + 1);
  assert.equal(calls.history, afterAdd.history);
  assert.equal(calls.ipo, afterAdd.ipo);
  assert.equal(calls.sector, afterAdd.sector);
});

test('refreshHistory refreshes daily history at most once per Istanbul date unless forced', async () => {
  let nowValue = new Date('2026-08-28T10:00:00.000Z');
  let historyCalls = 0;
  const service = createPortfolioService({
    repository: memoryRepository(),
    getQuote: async () => market(),
    getHistory: async () => { historyCalls += 1; return market(); },
    getIpo: async () => ipo(),
    getSector: async () => ({ ticker:'TEST', sector:'Enerji' }),
    now: () => nowValue, uuid: () => 'holding-1',
  });
  await service.addHolding({ ticker:'TEST', lots:10 });
  assert.equal(historyCalls, 1);
  await service.refreshHistory();
  assert.equal(historyCalls, 1);
  nowValue = new Date('2026-08-29T10:00:00.000Z');
  await service.refreshHistory();
  assert.equal(historyCalls, 2);
});

test('legacy marketSnapshot remains readable after v2 upgrade', async () => {
  const repository = memoryRepository();
  await repository.save({ holdings:[{
    id:'legacy-1', ticker:'TEST', initialLots:10, currentLots:10, sales:[],
    ipoSnapshot:{ ...ipo(), fetchedAt:'2026-08-20T10:00:00Z' },
    marketSnapshot:{ ...market(), fetchedAt:'2026-08-28T09:00:00Z' },
  }] });
  const service = createPortfolioService({
    repository,
    getQuote: async () => market(), getHistory: async () => market(), getIpo: async () => ipo(), getSector: async () => ({ticker:'TEST',sector:null}),
    now: () => new Date('2026-08-28T10:00:00.000Z'), uuid: () => 'unused',
  });
  const portfolio = await service.getPortfolio({ refresh:false });
  assert.equal(portfolio.holdings[0].currentPrice, 15);
  assert.equal(portfolio.holdings[0].history.length, 2);
});

test('background history refresh backfills missing sector for legacy holding', async () => {
  const repository = memoryRepository();
  await repository.save({ holdings:[{
    id:'legacy-2', ticker:'TEST', initialLots:10, currentLots:10, sales:[],
    ipoSnapshot:{ ...ipo(), fetchedAt:'2026-08-20T10:00:00Z' },
    quoteSnapshot:{ ...market(), fetchedAt:'2026-08-28T09:00:00Z' },
    historySnapshot:{ history:market().history, fetchedAt:'2026-08-27T09:00:00Z', fetchedLocalDate:'2026-08-27', startDate:'2026-08-20' },
  }] });
  let sectorCalls = 0;
  const service = createPortfolioService({
    repository, getQuote:async()=>market(), getHistory:async()=>market(), getIpo:async()=>ipo(),
    getSector:async()=>{ sectorCalls += 1; return {ticker:'TEST',sector:'Enerji',source:'Fintables'}; },
    now:()=>new Date('2026-08-28T10:00:00Z'), uuid:()=> 'unused',
  });
  const portfolio = await service.refreshHistory();
  assert.equal(sectorCalls, 1);
  assert.equal(portfolio.holdings[0].sector, 'Enerji');
});

test('cached long history is overlaid with recent quote rows so today appears in chart history', async () => {
  const repository = memoryRepository();
  await repository.save({ holdings:[{
    id:'merge-1', ticker:'TEST', initialLots:10, currentLots:10, sales:[],
    ipoSnapshot:{ ...ipo(), fetchedAt:'2026-08-20T10:00:00Z' },
    quoteSnapshot:{ ...market(15,14), latestMarketDate:'2026-08-28', fetchedAt:'2026-08-28T09:00:00Z' },
    historySnapshot:{
      history:[{date:'2026-08-20',close:10},{date:'2026-08-27',close:14}],
      fetchedAt:'2026-08-27T09:00:00Z', fetchedLocalDate:'2026-08-27', startDate:'2026-08-20',
    },
  }] });
  const service = createPortfolioService({
    repository, getQuote:async()=>market(), getHistory:async()=>market(), getIpo:async()=>ipo(), getSector:async()=>({ticker:'TEST',sector:null}),
    now:()=>new Date('2026-08-28T10:00:00Z'), uuid:()=> 'unused',
  });
  const portfolio = await service.getPortfolio({refresh:false});
  assert.equal(portfolio.holdings[0].history.at(-1).date, '2026-08-28');
  assert.equal(portfolio.history.at(-1).date, '2026-08-28');
  assert.equal(portfolio.history.at(-1).value, 150);
});

test('background refresh replaces an obviously corrupted cached sector label', async () => {
  const repository = memoryRepository();
  await repository.save({ holdings:[{
    id:'bad-sector-1', ticker:'CITAS', initialLots:10, currentLots:10, sales:[],
    ipoSnapshot:{ ...ipo(), ticker:'CITAS', fetchedAt:'2026-08-20T10:00:00Z' },
    quoteSnapshot:{ ...market(), ticker:'CITAS', fetchedAt:'2026-08-28T09:00:00Z' },
    historySnapshot:{ history:market().history, fetchedAt:'2026-08-28T09:00:00Z', fetchedLocalDate:'2026-08-28', startDate:'2026-08-20' },
    sectorSnapshot:{ ticker:'CITAS', sector:'Analizler Yeni Trade Ekranı Terminal Araştırma SPL Eğitimleri Giriş yap Ücretsiz kaydol Hisseler / CITAS Al / Sat CITAS Karşılaştır Çitlekçi Mağazacılık Gıda A.Ş. Özet Rapor', source:'Fintables' },
  }] });
  let sectorCalls = 0;
  const service = createPortfolioService({
    repository, getQuote:async()=>market(), getHistory:async()=>market(), getIpo:async()=>ipo(),
    getSector:async()=>{ sectorCalls += 1; return { ticker:'CITAS', sector:'Gıda Perakendeciliği', source:'Fintables' }; },
    now:()=>new Date('2026-08-28T10:00:00Z'), uuid:()=> 'unused',
  });
  const before = await service.getPortfolio({ refresh:false });
  assert.equal(before.holdings[0].sector, null);
  const after = await service.refreshHistory();
  assert.equal(sectorCalls, 1);
  assert.equal(after.holdings[0].sector, 'Gıda');
});


test('holding falls back to company-name sector inference when remote sector is unavailable', async () => {
  const repository = memoryRepository();
  await repository.save({ holdings:[{
    id:'sector-fallback-1', ticker:'CITAS', initialLots:10, currentLots:10, sales:[],
    ipoSnapshot:{ ...ipo(), ticker:'CITAS', company:'Çitlekçi Mağazacılık Gıda A.Ş.', fetchedAt:'2026-08-20T10:00:00Z' },
    quoteSnapshot:{ ...market(), ticker:'CITAS', fetchedAt:'2026-08-28T09:00:00Z' },
    sectorSnapshot:{ ticker:'CITAS', sector:null, source:null, fetchedAt:'2026-08-28T09:00:00Z' },
  }] });
  const service = createPortfolioService({
    repository, getQuote:async()=>market(), getHistory:async()=>market(), getIpo:async()=>ipo(),
    getSector:async()=>({ticker:'CITAS',sector:null,source:null}),
    now:()=>new Date('2026-08-28T20:00:00Z'), uuid:()=> 'unused',
  });
  const portfolio = await service.getPortfolio({ refresh:false });
  assert.equal(portfolio.holdings[0].sector, 'Gıda');
  assert.equal(portfolio.holdings[0].sectorSource, 'Otomatik sınıflandırma');
});

test('background refresh persists inferred company sector when remote provider returns no sector', async () => {
  let stored = { holdings:[{
    id:'sector-persist-1', ticker:'CITAS', initialLots:10, currentLots:10, sales:[],
    ipoSnapshot:{ ticker:'CITAS', company:'Çitlekçi Mağazacılık Gıda A.Ş.', ipoPrice:73.70, firstTradeDate:'2026-07-20', fetchedAt:'2026-08-20T10:00:00Z' },
    quoteSnapshot:{ ...market(), ticker:'CITAS', fetchedAt:'2026-08-28T09:00:00Z' },
    historySnapshot:{ history:market().history, fetchedAt:'2026-08-28T09:00:00Z', fetchedLocalDate:'2026-08-28', startDate:'2026-07-20' },
    sectorSnapshot:{ ticker:'CITAS', sector:null, source:null, fetchedAt:'2026-08-28T09:00:00Z' },
  }] };
  const repository = {
    load: async () => structuredClone(stored),
    save: async value => { stored = structuredClone(value); },
  };
  const service = createPortfolioService({
    repository, getQuote:async()=>market(), getHistory:async()=>market(), getIpo:async()=>ipo(),
    getSector:async()=>({ticker:'CITAS',sector:null,source:null}),
    now:()=>new Date('2026-08-28T20:00:00Z'), uuid:()=> 'unused',
  });
  const portfolio = await service.refreshHistory({ force:true });
  assert.equal(portfolio.holdings[0].sector, 'Gıda');
  assert.equal(stored.holdings[0].sectorSnapshot.sector, 'Gıda');
  assert.equal(stored.holdings[0].sectorSnapshot.source, 'Otomatik sınıflandırma');
});


test('specific company business line overrides generic remote retail sector', async () => {
  const repository = memoryRepository();
  await repository.save({ holdings:[{
    id:'sector-specific-1', ticker:'CITAS', initialLots:10, currentLots:10, sales:[],
    ipoSnapshot:{ ticker:'CITAS', company:'Çitlekçi Mağazacılık Gıda A.Ş.', ipoPrice:73.70, firstTradeDate:'2026-07-20', fetchedAt:'2026-08-20T10:00:00Z' },
    quoteSnapshot:{ ...market(), ticker:'CITAS', fetchedAt:'2026-08-28T09:00:00Z' },
    sectorSnapshot:{ ticker:'CITAS', sector:'Perakende Ticaret', source:'Fintables', fetchedAt:'2026-08-28T09:00:00Z' },
  }] });
  const service = createPortfolioService({
    repository, getQuote:async()=>market(), getHistory:async()=>market(), getIpo:async()=>ipo(),
    getSector:async()=>({ticker:'CITAS',sector:'Perakende Ticaret',source:'Fintables'}),
    now:()=>new Date('2026-08-28T20:00:00Z'), uuid:()=> 'unused',
  });
  const before = await service.getPortfolio({ refresh:false });
  assert.equal(before.holdings[0].sector, 'Gıda');
  await service.refreshHistory({ force:true });
  const after = await service.getPortfolio({ refresh:false });
  assert.equal(after.holdings[0].sector, 'Gıda');
});
