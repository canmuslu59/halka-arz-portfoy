import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) { return fs.readFile(path, 'utf8'); }

test('home UI contains market status, sorting, daily history, sector allocation and chart tooltip', async () => {
  const html = await read('public/index.html');
  for (const id of ['marketStatus','holdingSort','dailyHistory','sectorAllocation','sectorDonut','chartTooltip']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Bugün TL/);
  assert.match(html, /Bugün %/);
  assert.match(html, /Güncel değer/);
});

test('app wires BIST calendar, interactive chart, sorting and browser-history sheet navigation', async () => {
  const app = await read('public/app.js');
  assert.match(app, /getBistMarketStatus/);
  assert.match(app, /history\.pushState/);
  assert.match(app, /popstate/);
  assert.match(app, /pointerdown/);
  assert.match(app, /holdingSort/);
  assert.match(app, /sectorAllocation/);
  assert.match(app, /refreshHistory/);
  assert.match(app, /__showBackExitHint/);
});

test('responsive CSS styles new analytics controls and S22-class widths', async () => {
  const css = await read('public/styles.css');
  for (const selector of ['.market-status','.daily-row','.sector-donut','.chart-tooltip','.holding-controls','.sector-tag']) {
    assert.match(css, new RegExp(selector.replace('.', '\\\.')));
  }
  assert.match(css, /@media\s*\(max-width:430px\)/);
  assert.match(css, /topbar-actions/);
});

test('chart range offers full IPO-to-present history', async () => {
  const html = await read('public/index.html');
  assert.match(html, /<option value="0">Tümü<\/option>/);
  const app = await read('public/app.js');
  assert.match(app, /if \(days <= 0\) return history/);
});

test('add holding flow keeps a stable form reference across await and always opens blank', async () => {
  const app = await read('public/app.js');
  assert.match(app, /const addForm = event\.currentTarget;/);
  assert.match(app, /new FormData\(addForm\)/);
  assert.match(app, /addForm\.reset\(\)/);
  assert.doesNotMatch(app, /event\.currentTarget\.reset\(\)/);
  assert.match(app, /function resetAddEntryForm\(/);
  assert.match(app, /function openAddSheet[\s\S]*resetAddEntryForm\(\)/);
});

test('home screen exposes milestone app version so installed build can be verified', async () => {
  const html = await read('public/index.html');
  assert.match(html, /id=["']appVersion["']/);
  assert.match(html, /v2\.4\.5 • Build 27/);
});

test('UI shows real market-data timestamp instead of only local refresh completion time', async () => {
  const appJs = await read('public/app.js');
  assert.match(appJs, /marketDataTime/);
  assert.match(appJs, /Piyasa verisi/);
});

test('UI polls quotes frequently while BIST is open rather than once per minute', async () => {
  const appJs = await read('public/app.js');
  assert.match(appJs, /15_000/);
  assert.match(appJs, /getBistMarketStatus/);
});

