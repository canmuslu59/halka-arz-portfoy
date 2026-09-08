import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortfolioService } from '../public/core/portfolio-service.js';

function clone(value) {
  return structuredClone(value);
}

function repositoryWith(initial) {
  let stored = clone(initial);
  return {
    load: async () => clone(stored),
    save: async value => { stored = clone(value); },
  };
}

function holding({ quote, history }) {
  return {
    id:'h1', ticker:'TEST', initialLots:10, currentLots:10, sales:[],
    ipoSnapshot:{ ticker:'TEST', company:'Test AŞ', ipoPrice:50, firstTradeDate:'2026-09-01' },
    quoteSnapshot:{ ...quote, fetchedAt:'2026-09-04T15:31:00+03:00' },
    historySnapshot:{ history:clone(history), fetchedAt:'2026-09-04T18:10:00+03:00', fetchedLocalDate:'2026-09-04', startDate:'2026-09-01' },
  };
}

function createService({ repository, now, quote, dailyHistory }) {
  return createPortfolioService({
    repository,
    getQuote:async()=>clone(quote()),
    getHistory:async()=>({ ticker:'TEST', history:clone(dailyHistory()) }),
    getIpo:async()=>({ ticker:'TEST', company:'Test AŞ', ipoPrice:50, firstTradeDate:'2026-09-01' }),
    getSector:async()=>({ ticker:'TEST', sector:null, source:null }),
    now,
    uuid:()=> 'unused',
  });
}

const officialThroughFriday = [
  {date:'2026-09-01',close:50},
  {date:'2026-09-02',close:60},
  {date:'2026-09-03',close:70},
  {date:'2026-09-04',close:100},
];

test('Monday live quote cannot rewrite finalized Friday close or Friday P/L', async () => {
  let nowValue = new Date('2026-09-07T11:00:00+03:00');
  let quoteValue = {
    ticker:'TEST', current:105, previousClose:100, latestMarketDate:'2026-09-07', marketTime:'2026-09-07T11:00:00+03:00',
    history:[{date:'2026-09-04',close:99.5},{date:'2026-09-07',close:105}],
  };
  const repository = repositoryWith({ holdings:[holding({
    quote:{ ticker:'TEST', current:100, previousClose:70, latestMarketDate:'2026-09-04', history:[{date:'2026-09-04',close:100}] },
    history:officialThroughFriday,
  })] });
  const service = createService({ repository, now:()=>nowValue, quote:()=>quoteValue, dailyHistory:()=>officialThroughFriday });

  await service.getPortfolio({ refresh:true, force:true });
  const portfolio = await service.getPortfolio({ refresh:false });
  const friday = portfolio.history.find(row=>row.date === '2026-09-04');

  assert.equal(friday.value, 1000);
  assert.equal(friday.profit, 500);
  assert.equal(friday.dailyProfit, 300);
  assert.equal(portfolio.totals.dailyProfit, 50);
  assert.equal(portfolio.totals.dailyPct, 5);
});

test('repeated Monday quote refreshes keep Friday history byte-for-byte stable', async () => {
  let nowValue = new Date('2026-09-07T11:00:00+03:00');
  let quoteValue = {
    ticker:'TEST', current:105, previousClose:100, latestMarketDate:'2026-09-07', marketTime:'2026-09-07T11:00:00+03:00',
    history:[{date:'2026-09-04',close:99.5},{date:'2026-09-07',close:105}],
  };
  const repository = repositoryWith({ holdings:[holding({
    quote:{ ticker:'TEST', current:100, previousClose:70, latestMarketDate:'2026-09-04', history:[{date:'2026-09-04',close:100}] },
    history:officialThroughFriday,
  })] });
  const service = createService({ repository, now:()=>nowValue, quote:()=>quoteValue, dailyHistory:()=>officialThroughFriday });

  await service.getPortfolio({ refresh:true, force:true });
  const firstFriday = clone((await service.getPortfolio({ refresh:false })).history.find(row=>row.date === '2026-09-04'));

  quoteValue = {
    ...quoteValue, current:106, marketTime:'2026-09-07T12:00:00+03:00',
    history:[{date:'2026-09-04',close:99.2},{date:'2026-09-07',close:106}],
  };
  await service.getPortfolio({ refresh:true, force:true });
  const second = await service.getPortfolio({ refresh:false });
  const secondFriday = second.history.find(row=>row.date === '2026-09-04');

  assert.deepEqual(secondFriday, firstFriday);
  assert.equal(secondFriday.value, 1000);
  assert.equal(second.totals.dailyProfit, 60);
});

test('next trading day official daily history wins over rolling quote revisions for Monday and Friday', async () => {
  let nowValue = new Date('2026-09-08T10:00:00+03:00');
  const officialThroughMonday = [...officialThroughFriday,{date:'2026-09-07',close:107}];
  let quoteValue = {
    ticker:'TEST', current:108, previousClose:107, latestMarketDate:'2026-09-08', marketTime:'2026-09-08T10:00:00+03:00',
    history:[{date:'2026-09-04',close:99.1},{date:'2026-09-07',close:106.8},{date:'2026-09-08',close:108}],
  };
  const repository = repositoryWith({ holdings:[holding({
    quote:{ ticker:'TEST', current:106, previousClose:100, latestMarketDate:'2026-09-07', history:[{date:'2026-09-04',close:99.2},{date:'2026-09-07',close:106}] },
    history:officialThroughFriday,
  })] });
  const service = createService({ repository, now:()=>nowValue, quote:()=>quoteValue, dailyHistory:()=>officialThroughMonday });

  await service.refreshHistory({ force:true });
  await service.getPortfolio({ refresh:true, force:true });
  const portfolio = await service.getPortfolio({ refresh:false });
  const friday = portfolio.history.find(row=>row.date === '2026-09-04');
  const monday = portfolio.history.find(row=>row.date === '2026-09-07');

  assert.equal(friday.value, 1000);
  assert.equal(monday.value, 1070);
  assert.equal(monday.dailyProfit, 70);
  assert.equal(portfolio.totals.dailyProfit, 10);
});

test('rolling quote still backfills a missing previous trading day without replacing an existing official row', async () => {
  let nowValue = new Date('2026-09-07T11:00:00+03:00');
  const officialMissingFriday = officialThroughFriday.filter(row=>row.date !== '2026-09-04');
  let quoteValue = {
    ticker:'TEST', current:105, previousClose:100, latestMarketDate:'2026-09-07', marketTime:'2026-09-07T11:00:00+03:00',
    history:[{date:'2026-09-04',close:100},{date:'2026-09-07',close:105}],
  };
  const repository = repositoryWith({ holdings:[holding({
    quote:{ ticker:'TEST', current:70, previousClose:60, latestMarketDate:'2026-09-03', history:[{date:'2026-09-03',close:70}] },
    history:officialMissingFriday,
  })] });
  const service = createService({ repository, now:()=>nowValue, quote:()=>quoteValue, dailyHistory:()=>officialMissingFriday });

  await service.getPortfolio({ refresh:true, force:true });
  const portfolio = await service.getPortfolio({ refresh:false });
  const friday = portfolio.history.find(row=>row.date === '2026-09-04');

  assert.equal(friday.value, 1000);
  assert.equal(friday.dailyProfit, 300);
  assert.equal(portfolio.totals.dailyProfit, 50);
});

test('exchange previousClose backfills a missing prior session more accurately than the last 5m candle', async () => {
  let nowValue = new Date('2026-09-08T12:00:00+03:00');
  const officialMissingMonday = officialThroughFriday;
  let quoteValue = {
    ticker:'TEST', current:108, previousClose:107, latestMarketDate:'2026-09-08', marketTime:'2026-09-08T12:00:00+03:00',
    history:[
      {date:'2026-09-04',close:99.1},
      {date:'2026-09-07',close:106.5},
      {date:'2026-09-08',close:108},
    ],
  };
  const repository = repositoryWith({ holdings:[holding({
    quote:{ ticker:'TEST', current:100, previousClose:70, latestMarketDate:'2026-09-04', history:[{date:'2026-09-04',close:100}] },
    history:officialMissingMonday,
  })] });
  const service = createService({ repository, now:()=>nowValue, quote:()=>quoteValue, dailyHistory:()=>officialMissingMonday });

  await service.getPortfolio({ refresh:true, force:true });
  const portfolio = await service.getPortfolio({ refresh:false });
  const monday = portfolio.history.find(row=>row.date === '2026-09-07');

  assert.equal(monday.value, 1070);
  assert.equal(monday.profit, 570);
  assert.equal(monday.dailyProfit, 70);
  assert.equal(portfolio.totals.dailyProfit, 10);
});
