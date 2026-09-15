import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function text(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const index = text('public/index.html');
const app = text('public/app.js');
const premium = text('public/premium-demo.js');
const css = text('public/premium-demo.css');
const workflow = text('.github/workflows/premium-demo-test-apk.yml');

test('Premium Test exposes a normal-app entry that opens a dedicated fullscreen layer', () => {
  assert.match(index, /id=["']premiumEntry["']/);
  assert.match(index, /id=["']premiumOverlay["']/);
  assert.match(index, /id=["']premiumOverlayContent["']/);
  assert.match(index, /id=["']premiumOverlayClose["']/);
  assert.match(app, /function\s+openPremiumLayer\s*\(/);
  assert.match(app, /function\s+closePremiumLayer\s*\(/);
  assert.match(app, /premiumEntry/);
});

test('Premium overlay is viewport-sized and visually independent from the normal app page', () => {
  assert.match(css, /\.premium-fullscreen-overlay\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*z-index:\s*\d{3,}/s);
  assert.match(css, /\.premium-fullscreen-scroll\s*\{[^}]*overflow-y:\s*auto/s);
});

test('Premium landing communicates the requested value proposition with six large destinations', () => {
  assert.match(index, /Premium’u Keşfet/);
  assert.match(index, /Gelişmiş grafikler, akıllı alarmlar, Halka Arz Pro ve portföy analizleri\./);
  for (const label of ['Gelişmiş Grafikler', 'Akıllı Alarmlar', 'Halka Arz Pro', 'Portföy Analizi', 'Takip Listesi']) {
    assert.match(index, new RegExp(label));
  }
  assert.match(index, /Yedekleme\s*&amp;\s*Aktarım/);
  for (const ticker of ['ASELS', 'THYAO', 'TUPRS', 'BIMAS', 'KCHOL']) {
    assert.match(index, new RegExp(ticker));
  }
});

test('Premium landing contains a real-data allocation donut contract', () => {
  assert.match(index, /premium-allocation-donut/);
  assert.match(app, /premiumAllocationSegments/);
  assert.match(app, /activeValue/);
  assert.match(app, /conic-gradient/);
  assert.match(css, /\.premium-allocation-donut/);
});

test('Premium membership stays explicitly test-only with requested example pricing', () => {
  assert.match(premium, /₺49,99/);
  assert.match(premium, /₺299,99/);
  assert.match(premium, /%40 avantaj/i);
  assert.match(premium, /Premium Test Aktif/i);
});

test('Premium APK workflow applies the isolated transform before tests and stays below 25 minutes', () => {
  assert.match(workflow, /node scripts\/apply-premium-fullscreen-demo\.mjs/);
  assert.match(workflow, /applicationIdSuffix '\.premiumtest'/);
  assert.match(workflow, /Halka Arz Premium Test/);
  const timeout = workflow.match(/timeout-minutes:\s*(\d+)/);
  assert.ok(timeout, 'workflow timeout must be declared');
  assert.ok(Number(timeout[1]) < 25, `workflow timeout must be below 25 minutes, got ${timeout[1]}`);
});
