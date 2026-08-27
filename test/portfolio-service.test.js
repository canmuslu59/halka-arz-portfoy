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
