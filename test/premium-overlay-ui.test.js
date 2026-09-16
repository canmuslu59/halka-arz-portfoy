import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/premium-demo.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('Premium is launched from the visible top action into the isolated full-screen layer', () => {
  assert.match(index, /id="premiumEntry"/);
  assert.match(index, /Premium/);
  assert.match(index, /id="premiumOverlay"[^>]*premium-fullscreen-overlay[^>]*hidden/);
  assert.match(index, /id="premiumOverlayContent"/);
  assert.match(index, /id="premiumOverlayClose"/);

  assert.match(css, /\.premium-fullscreen-overlay\s*\{[^}]*position\s*:\s*fixed[^}]*inset\s*:\s*0/s);
  assert.match(css, /\.premium-fullscreen-frame\s*\{[^}]*height\s*:\s*100%/s);
  assert.match(css, /body\.premium-overlay-open\s*\{[^}]*overflow\s*:\s*hidden/s);
  assert.match(css, /\.premium-fullscreen-scroll\s*\{[^}]*overflow-y\s*:\s*auto/s);
  assert.match(css, /\.premium-discovery-copy\s*\{[^}]*border-radius/s);
});

test('Premium layer wiring stays additive and preserves portfolio, add-stock and notification flows', () => {
  assert.match(app, /function openPremiumLayer\s*\(/);
  assert.match(app, /function closePremiumLayer\s*\(/);
  assert.match(app, /premiumDemo\.render\(root/);
  assert.match(app, /premiumEntry[^\n]*addEventListener\(['"]click['"]/);
  assert.match(app, /premiumOverlayClose[^\n]*addEventListener\(['"]click['"]/);
  assert.match(app, /data-premium-open-section/);

  // Existing critical entry points must remain in place.
  assert.match(app, /function openAddSheet\s*\(/);
  assert.match(app, /function syncPushConfiguration\s*\(/);
  assert.match(app, /function renderPortfolio\s*\(/);
});
