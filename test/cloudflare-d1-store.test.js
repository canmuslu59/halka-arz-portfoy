import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1Store } from '../cloudflare/d1-store.js';

const seededRow = {
  install_id:'550e8400-e29b-41d4-a716-446655440000',
  fcm_token:'token-1',
  enabled:1,
  threshold:3,
  ipo_enabled:1,
  holdings_json:'[{"ticker":"THYAO","lots":7}]',
  alert_state_json:'{"day":"2026-09-14","portfolio":[3],"limits":{},"stocks":{}}',
  ipo_state_json:null,
  created_at:'2026-09-14T10:00:00.000Z',
  updated_at:'2026-09-14T10:00:00.000Z',
};

function fakeD1(seed = {}) {
  const rows = new Map((seed.installations || []).map(row => [row.install_id, structuredClone(row)]));
  let runtimeRow = seed.runtime || null;

  function statement(sql, args = []) {
    return {
      bind(...next) { return statement(sql, next); },
      async all() {
        if (/FROM installations/i.test(sql)) return { results:[...rows.values()].map(row => structuredClone(row)) };
        return { results:[] };
      },
      async first() {
        if (/FROM runtime_state/i.test(sql)) return runtimeRow ? structuredClone(runtimeRow) : null;
        return null;
      },
      async run() {
        if (/INSERT INTO installations/i.test(sql)) {
          const [install_id,fcm_token,enabled,threshold,ipo_enabled,holdings_json,alert_state_json,ipo_state_json,created_at,updated_at] = args;
          rows.set(install_id, { install_id,fcm_token,enabled,threshold,ipo_enabled,holdings_json,alert_state_json,ipo_state_json,created_at,updated_at });
        }
        if (/INSERT INTO runtime_state/i.test(sql)) {
          const [state_key,state_json,updated_at] = args;
          runtimeRow = { state_key,state_json,updated_at };
        }
        return { success:true };
      },
    };
  }

  return {
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      const results = [];
      for (const item of statements) results.push(await item.run());
      return results;
    },
  };
}

test('D1 store maps rows to existing push-service registration shape', async () => {
  const state = await createD1Store(fakeD1({ installations:[seededRow] })).read();
  const item = state.installations[seededRow.install_id];
  assert.equal(item.threshold, 3);
  assert.deepEqual(item.holdings, [{ticker:'THYAO',lots:7}]);
  assert.deepEqual(item.alertState.portfolio, [3]);
});

test('D1 mutate preserves prior delivery state while changing preferences', async () => {
  const store = createD1Store(fakeD1({ installations:[seededRow] }));
  await store.mutate(state => {
    const item = state.installations[seededRow.install_id];
    item.threshold = 4.5;
    item.holdings = [{ticker:'EREGL',lots:3}];
  });
  const item = (await store.read()).installations[seededRow.install_id];
  assert.equal(item.threshold, 4.5);
  assert.deepEqual(item.holdings, [{ticker:'EREGL',lots:3}]);
  assert.deepEqual(item.alertState.portfolio, [3]);
});

test('runtime state round-trips through D1 without exposing installation rows', async () => {
  const store = createD1Store(fakeD1());
  const value = {status:'checked',startedAt:'2026-09-14T10:00:00.000Z',finishedAt:'2026-09-14T10:00:01.000Z',result:{sent:1,failed:0}};
  await store.runtimeWrite(value);
  assert.deepEqual(await store.runtimeRead(), value);
});
