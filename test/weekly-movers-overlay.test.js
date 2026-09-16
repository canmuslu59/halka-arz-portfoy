import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const walletOverlay = readFileSync(new URL('../scripts/apply-test-wallet-metrics-nav.mjs', import.meta.url), 'utf8');
const navigationOverlay = readFileSync(new URL('../scripts/apply-test-portfolio-app-navigation.mjs', import.meta.url), 'utf8');
const overlay = `${walletOverlay}\n${navigationOverlay}`;

test('wallet home adds a compact weekly top movers card below comparison', () => {
  assert.match(overlay, /id="weeklyMoversCard"/);
  assert.match(overlay, /id="weeklyMoversList"/);
  assert.match(overlay, /Haftanın En Hareketlileri/);
  assert.match(overlay, /5 işlem günü/);
  assert.match(overlay, /weekly-movers-card/);
  assert.match(overlay, /#comparisonCard\{order:2\}/);
  assert.match(overlay, /\.weekly-movers-card\{order:3/);
});

test('weekly movers rank active holdings by absolute five-session percentage move', () => {
  assert.match(overlay, /const WEEKLY_MOVER_SESSIONS = 5/);
  assert.match(overlay, /function weeklyMoveForHolding/);
  assert.match(overlay, /holding\.history/);
  assert.match(overlay, /currentLots/);
  assert.match(overlay, /Math\.abs\(b\.weeklyPct\) - Math\.abs\(a\.weeklyPct\)/);
  assert.match(overlay, /slice\(0,\s*3\)/);
  assert.match(overlay, /renderWeeklyMovers/);
});

test('weekly movers stay display-only and have an explicit light-theme surface', () => {
  assert.match(overlay, /html\[data-theme="light"\] \.weekly-movers-card/);
  assert.match(overlay, /html\[data-theme="light"\] \.weekly-mover-row/);
  assert.doesNotMatch(overlay, /weeklyMovers[^\n]*fetch/i);
});
