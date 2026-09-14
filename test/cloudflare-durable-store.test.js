import test from 'node:test';
import assert from 'node:assert/strict';
import { PushStateDurableObject, createDurableStore } from '../cloudflare/durable-store.js';

function fakeState(seed = {}) {
  const values = new Map(Object.entries(seed));
  let alarmAt = null;
  const storage = {
    async get(key) { return structuredClone(values.get(key)); },
    async put(keyOrMap, value) {
      if (typeof keyOrMap === 'object' && keyOrMap !== null) {
        for (const [key, item] of Object.entries(keyOrMap)) values.set(key, structuredClone(item));
      } else {
        values.set(keyOrMap, structuredClone(value));
      }
    },
    async getAlarm() { return alarmAt; },
    async setAlarm(value) { alarmAt = Number(value); },
  };
  return {
    storage,
    blockConcurrencyWhile: async fn => fn(),
    get alarmAt() { return alarmAt; },
  };
}

function namespaceFor(object, { conflictOnce = false } = {}) {
  let forcedConflict = conflictOnce;
  const stub = {
    async fetch(request) {
      const url = new URL(request.url);
      if (forcedConflict && request.method === 'PUT' && url.pathname === '/state') {
        forcedConflict = false;
        return new Response(JSON.stringify({error:'REVISION_CONFLICT'}), {
          status:409,
          headers:{'content-type':'application/json'},
        });
      }
      return object.fetch(request);
    },
  };
  return {
    idFromName(name) { assert.equal(name, 'global'); return 'global-id'; },
    get(id) { assert.equal(id, 'global-id'); return stub; },
  };
}

test('Durable Object store persists registrations and runtime state across store clients', async () => {
  const object = new PushStateDurableObject(fakeState(), {});
  const namespace = namespaceFor(object);
  const first = createDurableStore(namespace);
  await first.mutate(state => {
    state.installations.alpha = { installId:'alpha', fcmToken:'token-a', threshold:1 };
  });
  await first.runtimeWrite({status:'checked',result:{sent:1}});

  const second = createDurableStore(namespace);
  assert.deepEqual((await second.read()).installations.alpha, {
    installId:'alpha', fcmToken:'token-a', threshold:1,
  });
  assert.deepEqual(await second.runtimeRead(), {status:'checked',result:{sent:1}});
});

test('Durable store retries a revision conflict without losing the caller mutation', async () => {
  const object = new PushStateDurableObject(fakeState(), {});
  const store = createDurableStore(namespaceFor(object, {conflictOnce:true}));
  let calls = 0;
  const result = await store.mutate(state => {
    calls += 1;
    state.installations.beta = { installId:'beta', fcmToken:'token-b' };
    return 'saved';
  });

  assert.equal(result, 'saved');
  assert.equal(calls, 2);
  assert.equal((await store.read()).installations.beta.fcmToken, 'token-b');
});

test('Durable Object never returns installation contents from runtime endpoint', async () => {
  const object = new PushStateDurableObject(fakeState(), {});
  const store = createDurableStore(namespaceFor(object));
  await store.mutate(state => {
    state.installations.secret = { installId:'secret', fcmToken:'private-token' };
  });
  await store.runtimeWrite({status:'market_closed'});

  const runtime = await store.runtimeRead();
  assert.deepEqual(runtime, {status:'market_closed'});
  assert.equal(JSON.stringify(runtime).includes('private-token'), false);
});

test('registration can seed one Durable Object alarm without delaying an earlier alarm', async () => {
  const state = fakeState();
  const object = new PushStateDurableObject(state, {});
  const store = createDurableStore(namespaceFor(object));

  const first = await store.ensureAlarm(1_000_000);
  assert.equal(first, 1_000_000);
  assert.equal(state.alarmAt, 1_000_000);

  const later = await store.ensureAlarm(2_000_000);
  assert.equal(later, 1_000_000);
  assert.equal(state.alarmAt, 1_000_000);

  const earlier = await store.ensureAlarm(500_000);
  assert.equal(earlier, 500_000);
  assert.equal(state.alarmAt, 500_000);
});

test('Durable Object defines an alarm handler so push checks do not depend on Cron Triggers', async () => {
  assert.equal(typeof PushStateDurableObject.prototype.alarm, 'function');
});
