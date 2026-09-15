import test from 'node:test';
import assert from 'node:assert/strict';

import { createWatchlistStore } from '../public/core/premium-watchlist.js';

function storageMock() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
  };
}

test('premium watchlist normalizes, de-duplicates and persists tickers', () => {
  const storage = storageMock();
  const store = createWatchlistStore(storage);
  assert.deepEqual(store.all(), []);
  assert.equal(store.add(' asels '), true);
  assert.equal(store.add('ASELS'), false);
  assert.equal(store.add('!!'), false);
  assert.equal(store.add('thyao'), true);
  assert.deepEqual(store.all(), ['ASELS','THYAO']);
  assert.equal(store.has('asels'), true);
});

test('premium watchlist toggle and remove only touch the premium watchlist key', () => {
  const storage = storageMock();
  const store = createWatchlistStore(storage);
  assert.equal(store.toggle('KCHOL'), true);
  assert.equal(store.toggle('KCHOL'), false);
  assert.equal(store.has('KCHOL'), false);
  store.add('TUPRS');
  assert.equal(store.remove('tuprs'), true);
  assert.equal(store.remove('tuprs'), false);
  assert.equal(storage.getItem('holdingSort'), null);
});
