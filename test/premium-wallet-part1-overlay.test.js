import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const overlay = readFileSync(new URL('../scripts/apply-premium-wallet-part1.mjs', import.meta.url), 'utf8');

test('Premium wallet Part 1 only changes wallet presentation assets', () => {
  assert.match(overlay, /wallet-metrics-grid/);
  assert.match(overlay, /Günlük Değişim/);
  assert.match(overlay, /weeklyMoversCard/);
  assert.match(overlay, /PREMIUM_TEST_WEEKLY_MOVER_SESSIONS = 5/);
  assert.match(overlay, /renderPremiumTestWeeklyMovers/);
  assert.match(overlay, /android\/app\/src\/main\/assets\/www\/index\.html/);
  assert.match(overlay, /android\/app\/src\/main\/assets\/www\/app\.js/);
  assert.match(overlay, /android\/app\/src\/main\/assets\/www\/styles\.css/);
});

test('Premium wallet Part 1 does not alter navigation, live notification, or pricing engines', () => {
  assert.doesNotMatch(overlay, /walletHomeTab|holdingsTab|performanceTab|marketsTab/);
  assert.doesNotMatch(overlay, /NotificationHelper|BackgroundAlertWorker|PushConfigSync/);
  assert.doesNotMatch(overlay, /market-reference|notification-rules|portfolio-service/);
  assert.doesNotMatch(overlay, /calculateTotals|evaluateDailyAlerts|notificationPayloadForEvent/);
});
