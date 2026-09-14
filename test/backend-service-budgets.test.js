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

test('ticker budget rotates across consecutive checks instead of starving later tickers', async () => {
  const store = memoryStore({ installations:seededRegistration({
    holdings:[{ticker:'AAA',lots:1},{ticker:'BBB',lots:1},{ticker:'CCC',lots:1}],
  }) });
  const fetched = [];
  const service = createPushService({
    store,
    sender:{send:async()=>{}},
    dataSources:{getQuote:async ticker => {
      fetched.push(ticker);
      return {ticker,current:100,previousClose:100,latestMarketDate:'2026-09-14'};
    }},
    now:()=>new Date('2026-09-14T10:00:00Z'),
  });

  await service.marketCheck({ maxUniqueTickers:2, maxNotifications:15 });
  await service.marketCheck({ maxUniqueTickers:2, maxNotifications:15 });

  assert.deepEqual(fetched, ['AAA','BBB','CCC','AAA']);
});

test('portfolio alerts are not permanently starved when one registration straddles ticker batches', async () => {
  const registration = (installId, token, holdings) => ({
    installId,
    fcmToken:token,
    enabled:true,
    threshold:1,
    ipoEnabled:true,
    holdings,
    alertState:null,
    ipoState:null,
    createdAt:'2026-09-14T09:00:00.000Z',
    updatedAt:'2026-09-14T09:00:00.000Z',
  });
  const store = memoryStore({ installations:{
    first:registration('first','token-a',[{ticker:'AAA',lots:1}]),
    second:registration('second','token-b',[{ticker:'BBB',lots:1},{ticker:'CCC',lots:1}]),
  }});
  const delivered = [];
  const service = createPushService({
    store,
    sender:{send:async(token,message)=>delivered.push({token,level:Number(message.data.level)})},
    dataSources:{getQuote:async ticker => ({ticker,current:101,previousClose:100,latestMarketDate:'2026-09-14'})},
    now:()=>new Date('2026-09-14T10:00:00Z'),
  });

  await service.marketCheck({ maxUniqueTickers:2, maxNotifications:15 });
  await service.marketCheck({ maxUniqueTickers:2, maxNotifications:15 });

  assert.ok(delivered.some(item => item.token === 'token-b' && item.level === 1),
    'a registration whose holdings cross a global ticker batch boundary must eventually get a complete portfolio evaluation');
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

test('permanently invalid FCM token is pruned without consuming the only delivery slot', async () => {
  const registration = (installId, token) => ({
    installId,
    fcmToken:token,
    enabled:true,
    threshold:1,
    ipoEnabled:true,
    holdings:[{ticker:'AAA',lots:1}],
    alertState:null,
    ipoState:null,
    createdAt:'2026-09-14T09:00:00.000Z', updatedAt:'2026-09-14T09:00:00.000Z',
  });
  const store = memoryStore({ installations:{
    bad:registration('bad','bad-token'),
    good:registration('good','good-token'),
  }});
  const delivered = [];
  const service = createPushService({
    store,
    sender:{send:async token => {
      if (token === 'bad-token') {
        const error = new Error('FCM token is unregistered.');
        error.code = 'FCM_TOKEN_INVALID';
        error.permanentToken = true;
        throw error;
      }
      delivered.push(token);
    }},
    dataSources:{getQuote:async ticker => ({ticker,current:101,previousClose:100,latestMarketDate:'2026-09-14'})},
    now:()=>new Date('2026-09-14T10:00:00Z'),
  });

  const result = await service.marketCheck({ maxUniqueTickers:30, maxNotifications:1 });
  assert.deepEqual(delivered, ['good-token']);
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
  assert.equal((await store.read()).installations.bad, undefined);
});
