import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('service worker uses the current cache generation and precaches every current app entry module', async () => {
  const sw = await read('public/sw.js');
  assert.match(sw, /CACHE\s*=\s*['"]halka-arz-portfoy-v7['"]/);
  for (const asset of [
    './privacy.html',
    './notification-recovery.js',
    './core/repository.js',
    './core/http.js',
    './core/data-sources.js',
    './core/gedik-calendar.js',
    './core/portfolio-service.js',
    './core/market-calendar.js',
    './core/analytics.js',
    './core/ipo-service.js',
    './core/ipo-analytics.js',
    './core/theme.js',
    './core/notification-rules.js',
    './core/pro-access.js',
    './core/navigation.js',
    './core/refresh-coordinator.js',
  ]) {
    assert.ok(sw.includes(`'${asset}'`), `${asset} must be precached`);
  }
});

test('service worker remains network-first and deletes cache generations other than the current one', async () => {
  const sw = await read('public/sw.js');
  assert.match(sw, /fetch\(e\.request\)/);
  assert.match(sw, /catch\(\(\)=>caches\.match\(e\.request\)\)/);
  assert.match(sw, /keys\.filter\(k=>k!==CACHE\)\.map\(k=>caches\.delete\(k\)\)/);
});
