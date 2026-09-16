import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const entryCss = fs.readFileSync(new URL('../public/premium-demo.css', import.meta.url), 'utf8');
const premiumCss = fs.readFileSync(new URL('../public/premium-app/premium.css', import.meta.url), 'utf8');
const premium = fs.readFileSync(new URL('../public/premium-app/index.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('Premium is launched from the visible top action into its isolated full-screen mini app', () => {
  assert.match(index, /id="premiumEntry"/);
  assert.match(index, /Premium/);
  assert.match(entryCss, /\.premium-entry-btn/);
  assert.match(premiumCss, /\.premium-mini-shell\s*\{[^}]*position\s*:\s*fixed[^}]*inset\s*:\s*0/s);
  assert.match(premiumCss, /body\.premium-mini-active/);
  assert.match(premium, /createPremiumApp/);
  assert.match(premium, /premium-bottom-nav/);
});

test('Premium mini app wiring stays additive and preserves portfolio, add-stock and notification flows', () => {
  assert.match(app, /premiumDemo\.render\(root/);
  assert.match(app, /premiumEntry[^\n]*addEventListener\(['"]click['"]/);

  // Existing critical entry points must remain in place.
  assert.match(app, /function openAddSheet\s*\(/);
  assert.match(app, /function syncPushConfiguration\s*\(/);
  assert.match(app, /function renderPortfolio\s*\(/);

  // Premium reuses existing native notification plumbing instead of faking a second channel.
  assert.match(premium, /showLocalNotification/);
  assert.match(premium, /Test Bildirimi Gönder/);
});
