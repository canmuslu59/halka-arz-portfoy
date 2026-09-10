import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../public/core/repository.js';
import { createPortfolioService } from '../public/core/portfolio-service.js';

function memoryRepository() {
  let raw = null;
  return createRepository({ get: async () => raw, set: async value => { raw = value; } });
}

function quote() {
  return {
    ticker:'TEST', symbol:'TEST.IS', current:15, previousClose:14,
    marketTime:'2026-08-28T09:00:00.000Z',
    history:[{ date:'2026-08-27', close:14 }, { date:'2026-08-28', close:15 }],
  };
}

function ipo() {
  return {
    ticker:'TEST', company:'Test AŞ', ipoPrice:10,
    firstTradeDate:'2026-08-20', offerDates:'18-19 Ağustos 2026', source:'Ahlatcı Yatırım',
  };
}

test('sale cannot be recorded before the known first trading date', async () => {
  const repository = memoryRepository();
  const service = createPortfolioService({
    repository,
    getQuote: async () => quote(),
    getHistory: async () => quote(),
    getIpo: async () => ipo(),
    getSector: async () => ({ ticker:'TEST', sector:'Test' }),
    now: () => new Date('2026-08-28T10:00:00.000Z'),
    uuid: (() => { let i = 0; return () => `id-${++i}`; })(),
  });

  const { holding } = await service.addHolding({ ticker:'TEST', lots:10 });
  await assert.rejects(
    () => service.addSale(holding.id, { lots:1, price:11, date:'2026-08-19' }),
    /ilk işlem|işlem tarihinden önce/i,
  );

  const portfolio = await service.getPortfolio({ refresh:false });
  assert.equal(portfolio.holdings[0].currentLots, 10);
  assert.equal(portfolio.holdings[0].sales.length, 0);
});

test('changing first trading date invalidates same-day history cache', async () => {
  const repository = memoryRepository();
  const historyStarts = [];
  const service = createPortfolioService({
    repository,
    getQuote: async () => quote(),
    getHistory: async (_ticker, startDate) => {
      historyStarts.push(startDate);
      return quote();
    },
    getIpo: async () => ipo(),
    getSector: async () => ({ ticker:'TEST', sector:'Test' }),
    now: () => new Date('2026-08-28T10:00:00.000Z'),
    uuid: (() => { let i = 0; return () => `id-${++i}`; })(),
  });

  const { holding } = await service.addHolding({ ticker:'TEST', lots:10 });
  assert.deepEqual(historyStarts, ['2026-08-20']);

  await service.updateHolding(holding.id, { firstTradeDateOverride:'2026-08-21' });
  await service.refreshHistory();

  assert.deepEqual(historyStarts, ['2026-08-20', '2026-08-21']);
});

test('first trading date cannot be moved after an already recorded sale', async () => {
  const repository = memoryRepository();
  const service = createPortfolioService({
    repository,
    getQuote: async () => quote(),
    getHistory: async () => quote(),
    getIpo: async () => ipo(),
    getSector: async () => ({ ticker:'TEST', sector:'Test' }),
    now: () => new Date('2026-08-28T10:00:00.000Z'),
    uuid: (() => { let i = 0; return () => `id-${++i}`; })(),
  });

  const { holding } = await service.addHolding({ ticker:'TEST', lots:10 });
  await service.addSale(holding.id, { lots:2, price:12, date:'2026-08-22' });

  await assert.rejects(
    () => service.updateHolding(holding.id, { firstTradeDateOverride:'2026-08-23' }),
    /satış|ilk işlem/i,
  );

  const portfolio = await service.getPortfolio({ refresh:false });
  assert.equal(portfolio.holdings[0].firstTradeDate, '2026-08-20');
  assert.equal(portfolio.holdings[0].sales[0].date, '2026-08-22');
});

test('manual first trading date cannot be in the future when adding a holding', async () => {
  const repository = memoryRepository();
  const service = createPortfolioService({
    repository,
    getQuote: async () => quote(),
    getHistory: async () => quote(),
    getIpo: async () => ipo(),
    getSector: async () => ({ ticker:'TEST', sector:'Test' }),
    now: () => new Date('2026-08-28T10:00:00.000Z'),
    uuid: () => 'id-1',
  });

  await assert.rejects(
    () => service.addHolding({ ticker:'TEST', lots:10, firstTradeDateOverride:'2026-08-29' }),
    /gelecekte olamaz/i,
  );

  const portfolio = await service.getPortfolio({ refresh:false });
  assert.equal(portfolio.holdings.length, 0);
});

test('manual first trading date cannot be moved into the future when editing a holding', async () => {
  const repository = memoryRepository();
  const service = createPortfolioService({
    repository,
    getQuote: async () => quote(),
    getHistory: async () => quote(),
    getIpo: async () => ipo(),
    getSector: async () => ({ ticker:'TEST', sector:'Test' }),
    now: () => new Date('2026-08-28T10:00:00.000Z'),
    uuid: (() => { let i = 0; return () => `id-${++i}`; })(),
  });

  const { holding } = await service.addHolding({ ticker:'TEST', lots:10 });
  await assert.rejects(
    () => service.updateHolding(holding.id, { firstTradeDateOverride:'2026-08-29' }),
    /gelecekte olamaz/i,
  );

  const portfolio = await service.getPortfolio({ refresh:false });
  assert.equal(portfolio.holdings[0].firstTradeDate, '2026-08-20');
});
