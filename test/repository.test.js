import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../public/core/repository.js';

test('repository persists holdings and restores them', async () => {
  let raw = null;
  const storage = { get: async () => raw, set: async value => { raw = value; } };
  const repo = createRepository(storage);
  await repo.save({ holdings: [{ id: '1', ticker: 'TEST' }] });
  assert.deepEqual(await repo.load(), { holdings: [{ id: '1', ticker: 'TEST' }] });
});

test('repository returns empty portfolio for corrupt storage', async () => {
  const repo = createRepository({ get: async () => '{bad', set: async () => {} });
  assert.deepEqual(await repo.load(), { holdings: [] });
});

test('repository normalizes missing holdings array', async () => {
  const repo = createRepository({ get: async () => '{"version":1}', set: async () => {} });
  assert.deepEqual(await repo.load(), { version: 1, holdings: [] });
});
