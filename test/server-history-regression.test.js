import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadServerHistoryFunction() {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const start = source.indexOf('function makePortfolioHistory(holdings)');
  const end = source.indexOf('\nfunction json(', start);
  assert.ok(start >= 0 && end > start, 'server makePortfolioHistory function must remain discoverable');
  const body = source.slice(start, end);
  return Function(`"use strict"; ${body}; return makePortfolioHistory;`)();
}

test('server portfolio history keeps pre-sale lots intact and applies sale proceeds only from sale date forward', async () => {
  const makePortfolioHistory = await loadServerHistoryFunction();
  const history = makePortfolioHistory([{
    ticker:'AAA',
    ipoPrice:10,
    initialLots:100,
    currentLots:50,
    firstTradeDate:'2026-09-01',
    sales:[{ lots:50, price:11, date:'2026-09-03' }],
    history:[
      { date:'2026-09-01', close:10 },
      { date:'2026-09-02', close:12 },
      { date:'2026-09-03', close:11 },
    ],
  }]);

  assert.deepEqual(history.map(row => ({ date:row.date, value:row.value, cost:row.cost, profit:row.profit })), [
    { date:'2026-09-01', value:1000, cost:1000, profit:0 },
    { date:'2026-09-02', value:1200, cost:1000, profit:200 },
    { date:'2026-09-03', value:1100, cost:1000, profit:100 },
  ]);
});
