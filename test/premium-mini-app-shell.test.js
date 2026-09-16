import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Premium mini app owns a distinct route tree and five-item bottom navigation', async () => {
  const { ROUTES, BOTTOM_NAV, normalizeRoute, routeBackTarget } = await import('../public/premium-app/router.js');
  assert.deepEqual(BOTTOM_NAV.map(item => item.id), ['home', 'analytics', 'alerts', 'ipo', 'menu']);
  for (const id of ['home','analytics','alerts','alert-editor','ipo','ipo-detail','menu','watchlist','calendar','backup','membership']) {
    assert.ok(ROUTES[id], `missing Premium route: ${id}`);
    assert.equal(normalizeRoute(id), id);
  }
  assert.equal(normalizeRoute('does-not-exist'), 'home');
  assert.equal(routeBackTarget('alert-editor'), 'alerts');
  assert.equal(routeBackTarget('ipo-detail'), 'ipo');
  assert.equal(routeBackTarget('backup'), 'menu');
});

test('legacy Premium controller is only a compatibility adapter for the new mini app', () => {
  const source = read('public/premium-demo.js');
  assert.match(source, /from ['"]\.\/premium-app\/index\.js['"]/);
  assert.match(source, /createPremiumApp/);
  assert.doesNotMatch(source, /premium-tab-list|premium-card-grid|renderChartsSection|renderAlertsSection/);
});

test('new Premium shell uses real core modules and does not create fake purchase behavior', () => {
  const source = read('public/premium-app/index.js');
  assert.match(source, /premium-analytics\.js/);
  assert.match(source, /premium-alerts\.js/);
  assert.match(source, /premium-backup\.js/);
  assert.match(source, /premium-watchlist\.js/);
  assert.match(source, /showLocalNotification/);
  assert.match(source, /Premium Test Aktif/);
  assert.match(source, /₺49,99/);
  assert.match(source, /₺299,99/);
  assert.match(source, /%40/);
  assert.match(source, /gerçek satın alma veya Play Billing işlemi yapılmaz/i);
  assert.doesNotMatch(source, /data-action=["']purchase["']/i);
  assert.doesNotMatch(source, />\s*Satın Al\s*</i);
  assert.doesNotMatch(source, /(?:function\s+purchase|\.purchase\s*\(|purchase\s*\()/i);
});

test('Premium visual shell is full-screen and isolated from the normal app chrome', () => {
  const css = read('public/premium-app/premium.css');
  assert.match(css, /\.premium-mini-shell\s*\{/);
  assert.match(css, /position\s*:\s*fixed/);
  assert.match(css, /\.premium-mini-active/);
  assert.match(css, /\.premium-bottom-nav/);
});

test('fullscreen transform no longer injects the legacy Premium overlay', () => {
  const transform = read('scripts/apply-premium-fullscreen-demo.mjs');
  assert.doesNotMatch(transform, /premium-fullscreen-overlay|premiumOverlayContent|premium-discovery-hero/);
  assert.match(transform, /premiumEntry/);
});
