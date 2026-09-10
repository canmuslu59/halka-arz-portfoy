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

const installId = '550e8400-e29b-41d4-a716-446655440000';

function registration(overrides = {}) {
  return {
    installId,
    fcmToken:'token-1234567890',
    config:{ enabled:true, threshold:3, ipoEnabled:true, holdings:[{ticker:'AAA',lots:10}] },
    ...overrides,
  };
}

test('registration upsert preserves delivery state but replaces client preferences', async () => {
  const store = memoryStore({ installations:{
    [installId]:{
      installId, fcmToken:'old-token-123456', enabled:true, threshold:3, ipoEnabled:true,
      holdings:[{ticker:'OLD',lots:1}], alertState:{day:'2026-09-04',stocks:{OLD:[3]},portfolio:[]},
      ipoState:{initialized:true,seen:['OLD']}, createdAt:'old', updatedAt:'old',
    },
  }});
  const service = createPushService({ store, sender:{send:async()=>{}}, dataSources:{}, now:()=>new Date('2026-09-05T08:00:00Z') });
  await service.register(registration({config:{enabled:false,threshold:4.5,ipoEnabled:false,holdings:[{ticker:'AAA',lots:12}]}}));
  const saved = (await store.read()).installations[installId];
  assert.equal(saved.enabled, false);
  assert.equal(saved.threshold, 4.5);
  assert.deepEqual(saved.holdings, [{ticker:'AAA',lots:12}]);
  assert.deepEqual(saved.alertState, {day:'2026-09-04',stocks:{OLD:[3]},portfolio:[]});
  assert.deepEqual(saved.ipoState, {initialized:true,seen:['OLD']});
});

test('market check fetches each unique ticker once, sends reached levels, and persists dedupe state after success', async () => {
  const store = memoryStore();
  const sent = [];
  let quoteCalls = 0;
  const service = createPushService({
    store,
    sender:{send:async(token,message)=>sent.push({token,message})},
    dataSources:{
      getQuote:async ticker => { quoteCalls += 1; return {ticker,current:106,previousClose:100}; },
      getIpoCalendar:async()=>[],
    },
    now:()=>new Date('2026-09-04T10:00:00Z'),
  });
  await service.register(registration());
  await service.marketCheck();
  assert.equal(quoteCalls, 1);
  assert.deepEqual(sent.map(x=>[x.message.data.kind,x.message.data.level]), [['portfolio','3'],['portfolio','6']]);
  sent.length = 0;
  await service.marketCheck();
  assert.equal(sent.length, 0);
});

test('failed market push does not advance alert state so the event can retry', async () => {
  const store = memoryStore();
  const service = createPushService({
    store,
    sender:{send:async()=>{ throw new Error('FCM down'); }},
    dataSources:{getQuote:async ticker=>({ticker,current:103,previousClose:100}),getIpoCalendar:async()=>[]},
    now:()=>new Date('2026-09-04T10:00:00Z'),
  });
  await service.register(registration());
  const result = await service.marketCheck();
  assert.equal(result.failed, 1); // portfolio at +3
  assert.equal((await store.read()).installations[installId].alertState, null);
});

test('IPO check seeds first snapshot then sends only a later new IPO once per install', async () => {
  const store = memoryStore();
  const sent = [];
  let calendar = [{ticker:'AAA',company:'A AŞ'}];
  const service = createPushService({
    store,
    sender:{send:async(token,message)=>sent.push(message)},
    dataSources:{getQuote:async()=>null,getIpoCalendar:async()=>calendar},
    now:()=>new Date('2026-09-04T10:00:00Z'),
  });
  await service.register(registration());
  await service.ipoCheck();
  assert.equal(sent.length, 0);
  calendar = [{ticker:'AAA',company:'A AŞ'},{ticker:'BBB',company:'B AŞ'}];
  await service.ipoCheck();
  assert.deepEqual(sent.map(m=>[m.data.kind,m.data.ticker]), [['ipo','BBB']]);
  sent.length = 0;
  await service.ipoCheck();
  assert.equal(sent.length, 0);
});
