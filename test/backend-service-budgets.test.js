import test from 'node:test';
import assert from 'node:assert/strict';
import { createPushService } from '../backend/service.js';

function memoryStore(seed = {}) {
  let state = structuredClone({ installations:{}, ...seed });
  return {
    async read() { return structuredClone(state); },
    async mutate(fn) {
      const draft = structuredClone(state);
      const result = await fn(draft);
      state = draft;
      return result;
    },
  };
}

function seededRegistration({threshold = 1, holdings = [{ticker:'AAA',lots:1}]} = {}) {
  return {
    id:{
      installId:'id', fcmToken:'token', enabled:true, threshold, ipoEnabled:true,
      holdings, alertState:null, ipoState:null,
      createdAt:'2026-09-14T09:00:00.000Z', updatedAt:'2026-09-14T09:00:00.000Z',
    },
  };
}

test('market check enforces unique-ticker budget and reports partial diagnostics', async () => {
  const store = memoryStore({ installations:seededRegistration({
    holdings:[{ticker:'AAA',lots:1},{ticker:'BBB',lots:1},{ticker:'CCC',lots:1}],
  }) });
  const fetched = [];
  const service = createPushService({
    store,
    sender:{send:async()=>{}},
    dataSources:{getQuote:async ticker => {
      fetched.push(ticker);
      return {ticker,current:101,previousClose:100,latestMarketDate:'2026-09-14'};
    }},
    now:()=>new Date('2026-09-14T10:00:00Z'),
  });

  const result = await service.marketCheck({ maxUniqueTickers:2, maxNotifications:15 });
  assert.equal(result.partial, true);
  assert.equal(result.reason, 'ticker_budget');
  assert.equal(result.totalTickers, 3);
  assert.equal(result.checkedTickers, 2);
  assert.deepEqual(fetched, ['AAA','BBB']);
});

test('notification budget leaves unsent portfolio levels eligible for the next cron run', async () => {
  const store = memoryStore({ installations:seededRegistration({threshold:1}) });
  const sent = [];
  const service = createPushService({
    store,
    sender:{send:async(_token,message)=>sent.push(Number(message.data.level))},
    dataSources:{getQuote:async ticker => ({ticker,current:106,previousClose:100,latestMarketDate:'2026-09-14'})},
    now:()=>new Date('2026-09-14T10:00:00Z'),
  });

  const first = await service.marketCheck({ maxUniqueTickers:30, maxNotifications:2 });
  assert.equal(first.partial, true);
  assert.equal(first.reason, 'notification_budget');
  assert.deepEqual(sent, [1,2]);
  assert.deepEqual((await store.read()).installations.id.alertState.portfolio, [1,2]);

  sent.length = 0;
  const second = await service.marketCheck({ maxUniqueTickers:30, maxNotifications:2 });
  assert.equal(second.partial, true);
  assert.deepEqual(sent, [3,4]);
  assert.deepEqual((await store.read()).installations.id.alertState.portfolio, [1,2,3,4]);
});
