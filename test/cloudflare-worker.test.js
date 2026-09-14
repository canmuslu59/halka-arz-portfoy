import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerApp } from '../cloudflare/worker.js';

function memoryStore(seed = {}) {
  let state = structuredClone({ installations:{}, ...seed });
  let runtime = null;
  return {
    async read() { return structuredClone(state); },
    async mutate(fn) {
      const draft = structuredClone(state);
      const result = await fn(draft);
      state = draft;
      return result;
    },
    async runtimeRead() { return structuredClone(runtime); },
    async runtimeWrite(value) { runtime = structuredClone(value); return value; },
  };
}

function appHarness({ now = Date.parse('2026-09-14T10:00:00Z'), store = memoryStore(), quote = null, ipoCalendar = [] } = {}) {
  let quoteCalls = 0;
  let ipoCalls = 0;
  const sent = [];
  const app = createWorkerApp({
    createStore:()=>store,
    createSender:()=>({ configured:true, send:async(token,message)=>sent.push({token,message}) }),
    fetchQuote:async ticker => {
      quoteCalls += 1;
      return quote ? quote(ticker) : {ticker,current:101,previousClose:100,latestMarketDate:'2026-09-14'};
    },
    fetchIpoCalendar:async () => {
      ipoCalls += 1;
      return typeof ipoCalendar === 'function' ? ipoCalendar() : structuredClone(ipoCalendar);
    },
    now:()=>now,
  });
  return {
    app, store, sent,
    get quoteCalls() { return quoteCalls; },
    get ipoCalls() { return ipoCalls; },
  };
}

test('health reports two-minute cloud cadence and 15-minute Android fallback without secrets', async () => {
  const store = memoryStore({installations:{secret:{
    installId:'secret',fcmToken:'token-123',enabled:true,threshold:1,ipoEnabled:true,
    holdings:[{ticker:'THYAO',lots:10}],alertState:null,ipoState:null,createdAt:'x',updatedAt:'x',
  }}});
  const {app} = appHarness({store});
  const response = await app.fetch(new Request('https://unit.test/api/health'), {DB:{},FIREBASE_SERVICE_ACCOUNT_JSON:'-----BEGIN PRIVATE KEY----- SECRET'}, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.push.pollIntervalMs, 120000);
  assert.equal(body.push.androidFallbackMinutes, 15);
  assert.equal(body.push.installationCount, 1);
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes('token-123'), false);
  assert.equal(serialized.includes('THYAO'), false);
  assert.equal(serialized.includes('PRIVATE KEY'), false);
});

test('POST /v1/installations normalizes and persists Android registration', async () => {
  const {app,store} = appHarness();
  const response = await app.fetch(new Request('https://unit.test/v1/installations', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      installId:'550e8400-e29b-41d4-a716-446655440000',
      fcmToken:'device-token',
      config:{enabled:true,threshold:1.2,ipoEnabled:true,holdings:[{ticker:'thyao',lots:7}]},
    }),
  }), {}, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.threshold, 1);
  assert.deepEqual(body.holdings, [{ticker:'THYAO',lots:7}]);
  const saved = (await store.read()).installations['550e8400-e29b-41d4-a716-446655440000'];
  assert.equal(saved.fcmToken, 'device-token');
});

test('registration endpoint rejects malformed and oversized JSON', async () => {
  const {app} = appHarness();
  const malformed = await app.fetch(new Request('https://unit.test/v1/installations', {
    method:'POST', headers:{'content-type':'application/json'}, body:'{broken',
  }), {}, {});
  assert.equal(malformed.status, 400);

  const huge = await app.fetch(new Request('https://unit.test/v1/installations', {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({padding:'x'.repeat(132000)}),
  }), {}, {});
  assert.equal(huge.status, 413);
});

test('market-closed scheduled run still checks IPO calendar while performing zero quote requests', async () => {
  const store = memoryStore({installations:{one:{
    installId:'one',fcmToken:'device-token',enabled:true,threshold:1,ipoEnabled:true,
    holdings:[],alertState:null,ipoState:null,createdAt:'x',updatedAt:'x',
  }}});
  const h = appHarness({
    store,
    now:Date.parse('2026-09-13T09:00:00Z'),
    ipoCalendar:[{ticker:'NEWCO',company:'New Company A.Ş.',offerDates:'15-16 Eylül 2026'}],
  });
  await h.app.scheduled({scheduledTime:Date.parse('2026-09-13T09:00:00Z')}, {}, {});
  assert.equal(h.quoteCalls, 0);
  assert.equal(h.ipoCalls, 1);
  const state = await h.store.read();
  assert.equal(state.installations.one.ipoState.initialized, true);
  assert.deepEqual(state.installations.one.ipoState.seen, ['NEWCO|15-16 Eylül 2026']);
  const runtime = await h.store.runtimeRead();
  assert.equal(runtime.status, 'market_closed');
});

test('open-market scheduled run checks registrations and records result', async () => {
  const store = memoryStore({installations:{one:{
    installId:'one',fcmToken:'device-token',enabled:true,threshold:1,ipoEnabled:true,
    holdings:[{ticker:'AAA',lots:1}],alertState:null,ipoState:null,createdAt:'x',updatedAt:'x',
  }}});
  const h = appHarness({store,now:Date.parse('2026-09-14T10:00:00Z')});
  await h.app.scheduled({scheduledTime:Date.parse('2026-09-14T10:00:00Z')}, {}, {});
  assert.equal(h.quoteCalls, 1);
  assert.equal(h.ipoCalls, 1);
  const runtime = await store.runtimeRead();
  assert.equal(runtime.status, 'checked');
  assert.equal(runtime.result.sent, 1);
});
