import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function text(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const index = text('public/index.html');
const app = text('public/app.js');
const premium = text('public/premium-app/index.js');
const css = text('public/premium-app/premium.css');
const workflow = text('.github/workflows/premium-demo-test-apk.yml');
const transform = text('scripts/apply-premium-fullscreen-demo.mjs');

test('Premium Test exposes a visible normal-app entry into the isolated mini app', () => {
  assert.match(index, /id=["']premiumEntry["']/);
  assert.match(app, /premiumEntry[^\n]*addEventListener\(['"]click['"][^\n]*switchView\(['"]pro['"]\)/);
  assert.match(premium, /premium-mini-shell/);
  assert.match(premium, /premium-bottom-nav/);
  assert.doesNotMatch(transform, /premium-fullscreen-overlay|premiumOverlayContent/);
});

test('Premium shell fills the viewport and hides the normal app chrome while mounted', () => {
  assert.match(css, /\.premium-mini-shell\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*z-index:\s*\d{3,}/s);
  assert.match(css, /body\.premium-mini-active[^\n]*\.topbar/s);
  assert.match(css, /\.premium-mini-content\s*\{[^}]*overflow-y:\s*auto/s);
});

test('Premium landing keeps copy short and provides four strong destinations plus requested visual tickers', () => {
  assert.match(premium, /Premium’u Keşfet/);
  for (const label of ['Analiz', 'Akıllı Alarmlar', 'Halka Arz Pro', 'Takip']) assert.match(premium, new RegExp(label));
  for (const ticker of ['ASELS', 'THYAO', 'TUPRS', 'BIMAS', 'KCHOL']) assert.match(premium, new RegExp(ticker));
});

test('Premium analysis uses real-data allocation and chart contracts', () => {
  assert.match(premium, /buildPremiumAnalytics/);
  assert.match(premium, /buildPremiumSeries/);
  assert.match(premium, /activeValue/);
  assert.match(premium, /conic-gradient/);
  assert.match(css, /\.premium-donut/);
});

test('Premium membership stays explicitly test-only with requested example pricing', () => {
  assert.match(premium, /₺49,99/);
  assert.match(premium, /₺299,99/);
  assert.match(premium, /%40 avantaj/i);
  assert.match(premium, /Premium Test Aktif/i);
  assert.match(premium, /Play Billing/);
});

test('Premium APK workflow applies isolated integration before tests and preserves separate identity', () => {
  assert.match(workflow, /node scripts\/apply-premium-fullscreen-demo\.mjs/);
  assert.match(workflow, /applicationIdSuffix '\.premiumtest'/);
  assert.match(workflow, /Halka Arz Premium Test/);
});
