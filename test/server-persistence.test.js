import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPortfolioStore } from '../backend/portfolio-store.js';

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'halkaarz-store-'));
  const filePath = path.join(dir, 'nested', 'portfolio.json');
  return { dir, filePath, store:createPortfolioStore({ filePath }) };
}

test('portfolio store returns an empty portfolio only when the file is missing', async t => {
  const f = await fixture();
  t.after(() => rm(f.dir, { recursive:true, force:true }));
  assert.deepEqual(await f.store.read(), { holdings:[] });

  await mkdir(path.dirname(f.filePath), { recursive:true });
  await writeFile(f.filePath, '{"holdings":[', 'utf8');
  await assert.rejects(() => f.store.read(), /Portföy veri dosyası bozuk/);
});

test('concurrent portfolio mutations are serialized without lost updates', async t => {
  const f = await fixture();
  t.after(() => rm(f.dir, { recursive:true, force:true }));

  await Promise.all(Array.from({ length:24 }, (_, index) => f.store.mutate(async data => {
    await new Promise(resolve => setTimeout(resolve, index % 4));
    data.holdings.push({ id:String(index), ticker:`T${index}` });
  })));

  const saved = JSON.parse(await readFile(f.filePath, 'utf8'));
  assert.equal(saved.holdings.length, 24);
  assert.equal(new Set(saved.holdings.map(item => item.id)).size, 24);
});

test('store exposes mutation queue rather than an unsafe public write primitive', async t => {
  const f = await fixture();
  t.after(() => rm(f.dir, { recursive:true, force:true }));
  assert.equal(typeof f.store.read, 'function');
  assert.equal(typeof f.store.mutate, 'function');
  assert.equal(f.store.write, undefined);
});

test('durable write fsyncs the temp file before atomic rename', async () => {
  const source = await readFile(new URL('../backend/portfolio-store.js', import.meta.url), 'utf8');
  const syncAt = source.indexOf('await handle.sync()');
  const closeAt = source.indexOf('await handle.close()');
  const renameAt = source.indexOf('await fs.rename(tmpPath, filePath)');
  assert.ok(syncAt >= 0, 'temp file must be fsynced');
  assert.ok(closeAt > syncAt, 'temp file must close after fsync');
  assert.ok(renameAt > closeAt, 'atomic rename must happen after close');
  assert.match(source, /crypto\.randomUUID\(\)/);
});
