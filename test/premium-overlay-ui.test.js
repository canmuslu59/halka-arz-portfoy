import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/premium-demo.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('Premium is launched from a visible top action into its own full-screen experience', () => {
  assert.match(index, /id="premiumLauncher"/);
  assert.match(index, /Pro['’]ya Geç|Premium/);
  assert.match(index, /id="premiumOverlay"[^>]*hidden/);
  assert.match(index, /id="premiumOverlayContent"/);
  assert.match(index, /id="premiumOverlayClose"/);
  assert.match(index, /id="proTab"[^>]*hidden/);

  assert.match(css, /\.premium-overlay\s*\{[^}]*position\s*:\s*fixed[^}]*inset\s*:\s*0/s);
  assert.match(css, /\.premium-overlay-shell\s*\{[^}]*min-height\s*:\s*100(?:dvh|vh)/s);
  assert.match(css, /body\.premium-overlay-open\s*\{[^}]*overflow\s*:\s*hidden/s);
  assert.match(css, /\.premium-overlay\s+\.premium-hero-value\s*\{[^}]*font-size\s*:\s*(?:4[0-9]|5[0-9])px/s);
  assert.match(css, /\.premium-overlay\s+\.premium-chart-canvas-wrap\s*\{[^}]*height\s*:\s*(?:3[4-9][0-9]|4[0-9]{2})px/s);
});

test('Premium overlay is wired without replacing portfolio, add-stock or notification flows', () => {
  assert.match(app, /function openPremiumOverlay\s*\(/);
  assert.match(app, /premiumDemo\.render\(content/);
  assert.match(app, /premiumLauncher[^\n]*addEventListener\(['"]click['"]/);
  assert.match(app, /premiumOverlayClose[^\n]*addEventListener\(['"]click['"]/);
  assert.match(app, /data-pro-ticker[\s\S]*openPremiumOverlay/);

  // Existing critical entry points must remain in place.
  assert.match(app, /function openAddSheet\s*\(/);
  assert.match(app, /function syncPushConfiguration\s*\(/);
  assert.match(app, /function renderPortfolio\s*\(/);
});
