import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortfolioService } from '../public/core/portfolio-service.js';

function clone(value) { return structuredClone(value); }
function repo(initial) {
  let stored = clone(initial);
  return { load:async()=>clone(stored), save:async value=>{ stored=clone(value); } };
}

test('Saturday refresh keeps finalized Friday daily close even if rolling 5m Friday candle differs', async () => {
  const nowValue = new Date('2026-09-05T12:00:00+03:00');
  const dailyHistory = [
    {date:'2026-09-02',close:60},
    {date:'2026-09-03',close:70},
    {date:'2026-09-04',close:100},
  ];
  const quote = {
    ticker:'TEST', current:100, previousClose:70,
    latestMarketDate:'2026-09-04', marketTime:'2026-09-04T18:01:00+03:00',
    history:[{date:'2026-09-03',close:69.5},{date:'2026-09-04',close:98.5}],
  };
  const repository = repo({ holdings:[{
    id:'h1', ticker:'TEST', initialLots:10, currentLots:10, sales:[],
    ipoSnapshot:{ticker:'TEST',company:'Test AŞ',ipoPrice:50,firstTradeDate:'2026-09-02'},
    quoteSnapshot:{...quote,fetchedAt:'2026-09-05T12:00:00+03:00'},
    historySnapshot:{history:dailyHistory,fetchedAt:'2026-09-04T18:10:00+03:00',fetchedLocalDate:'2026-09-04',startDate:'2026-09-02'},
  }] });
  const service = createPortfolioService({
    repository,
    getQuote:async()=>clone(quote),
    getHistory:async()=>({ticker:'TEST',history:clone(dailyHistory)}),
    getIpo:async()=>({ticker:'TEST',company:'Test AŞ',ipoPrice:50,firstTradeDate:'2026-09-02'}),
    getSector:async()=>({ticker:'TEST',sector:null,source:null}),
    now:()=>nowValue,
    uuid:()=> 'unused',
  });

  const portfolio = await service.getPortfolio({refresh:false});
  const friday = portfolio.history.find(row=>row.date==='2026-09-04');

  assert.equal(friday.value, 1000);
  assert.equal(friday.profit, 500);
  assert.equal(friday.dailyProfit, 300);
  assert.equal(portfolio.totals.dailyProfit, 0);
});
