import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBackupPayload,
  serializeBackupPayload,
  parseBackupPayload,
} from '../public/core/premium-backup.js';

const data = {
  portfolio:{ holdings:[{ ticker:'ASELS', initialLots:10, sales:[] }] },
  settings:{ themePreference:'dark', holdingSort:'dailyProfit' },
  premiumRules:[{ id:'r1', type:'price_above', ticker:'ASELS', value:120, enabled:true }],
  watchlist:['ASELS','THYAO'],
};

test('premium backup creates a versioned deterministic payload and round-trips through JSON', () => {
  const payload = createBackupPayload(data, { now:() => 1700000000000 });
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.exportedAt, '2023-11-14T22:13:20.000Z');
  assert.deepEqual(payload.watchlist, ['ASELS','THYAO']);

  const text = serializeBackupPayload(data, { now:() => 1700000000000 });
  const parsed = parseBackupPayload(text);
  assert.deepEqual(parsed, payload);
});

test('premium backup parser rejects corrupt JSON and unsupported schemas', () => {
  assert.throws(() => parseBackupPayload('{oops'), /geçersiz|bozuk/i);
  assert.throws(() => parseBackupPayload(JSON.stringify({ schemaVersion:99 })), /sürüm/i);
});

test('premium backup parser rejects malformed sections instead of silently accepting destructive input', () => {
  assert.throws(() => parseBackupPayload(JSON.stringify({
    schemaVersion:1,
    exportedAt:'2026-09-15T10:00:00.000Z',
    portfolio:[],
    settings:{},
    premiumRules:[],
    watchlist:[],
  })), /portföy/i);

  assert.throws(() => parseBackupPayload(JSON.stringify({
    schemaVersion:1,
    exportedAt:'2026-09-15T10:00:00.000Z',
    portfolio:{ holdings:[] },
    settings:{},
    premiumRules:{},
    watchlist:[],
  })), /alarm/i);
});

test('premium backup normalizes watchlist tickers and keeps only explicit portable settings', () => {
  const payload = createBackupPayload({
    ...data,
    settings:{ themePreference:'light', holdingSort:'ticker', secret:'must-not-export' },
    watchlist:[' asels ', 'ASELS', 'thyao', '!!'],
  }, { now:() => 1700000000000 });

  assert.deepEqual(payload.watchlist, ['ASELS','THYAO']);
  assert.deepEqual(payload.settings, { themePreference:'light', holdingSort:'ticker' });
  assert.equal('secret' in payload.settings, false);
});
