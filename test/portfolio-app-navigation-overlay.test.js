import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const navigationOverlayUrl = new URL('../scripts/apply-test-portfolio-app-navigation.mjs', import.meta.url);
const navigationOverlay = existsSync(navigationOverlayUrl) ? readFileSync(navigationOverlayUrl, 'utf8') : '';
const combinedOverlay = [
  read('../scripts/apply-test-share-ui.mjs'),
  read('../scripts/apply-test-wallet-metrics-nav.mjs'),
  navigationOverlay,
].join('\n');

test('test-only navigation exposes Performance, Markets, centered Wallet, Advanced and Settings', () => {
  assert.match(navigationOverlay, /performanceView/);
  assert.match(navigationOverlay, /marketsView/);
  assert.match(navigationOverlay, /data-view="performance"/);
  assert.match(navigationOverlay, /data-view="markets"/);
  assert.match(combinedOverlay, /id="walletHomeTab"/);
  assert.match(combinedOverlay, /data-view="portfolio"/);
  assert.match(navigationOverlay, />Performans</);
  assert.match(navigationOverlay, />Piyasalar</);
  assert.doesNotMatch(navigationOverlay, /data-view="calendar"[^>]*>[\s\S]*?<b>Takvim<\/b>/);
});

test('wallet comparison becomes a focused daily weekly monthly card with four references', () => {
  assert.match(navigationOverlay, /comparisonRangeDaily/);
  assert.match(navigationOverlay, /comparisonRangeWeekly/);
  assert.match(navigationOverlay, /comparisonRangeMonthly/);
  assert.match(navigationOverlay, /Günlük/);
  assert.match(navigationOverlay, /Haftalık/);
  assert.match(navigationOverlay, /Aylık/);
  assert.match(navigationOverlay, /Portföy/);
  assert.match(navigationOverlay, /Altın \(TL\)/);
  assert.match(navigationOverlay, /BIST 100/);
  assert.match(navigationOverlay, /Dolar/);
  assert.match(navigationOverlay, /comparisonRangeSessions/);
  assert.match(navigationOverlay, /daily:\s*1/);
  assert.match(navigationOverlay, /weekly:\s*5/);
  assert.match(navigationOverlay, /monthly:\s*22/);
  assert.doesNotMatch(navigationOverlay, /comparisonSummary/);
  assert.doesNotMatch(navigationOverlay, /comparisonStatus/);
});

test('performance view reuses existing analytics instead of introducing new portfolio calculations', () => {
  assert.match(navigationOverlay, /chart-card/);
  assert.match(navigationOverlay, /dailyHistory/);
  assert.match(navigationOverlay, /sectorAllocation/);
  assert.match(navigationOverlay, /drawChart/);
  assert.doesNotMatch(navigationOverlay, /calculateTotals\s*=|evaluateDailyAlerts\s*=|notificationPayloadForEvent\s*=/);
});

test('markets view includes market summary and preserves IPO calendar contracts', () => {
  assert.match(navigationOverlay, /marketSummary/);
  assert.match(navigationOverlay, /marketSummaryBist/);
  assert.match(navigationOverlay, /marketSummaryGold/);
  assert.match(navigationOverlay, /marketSummaryUsd/);
  assert.match(navigationOverlay, /calendarRefreshBtn/);
  assert.match(navigationOverlay, /calendarStatus/);
  assert.match(navigationOverlay, /calendarFilter/);
  assert.match(navigationOverlay, /calendarList/);
  assert.match(navigationOverlay, /loadIpoCalendar/);
});

test('watchlist remains out of scope and existing image sharing remains intact', () => {
  assert.doesNotMatch(navigationOverlay, /Takip Listesi|watchlist/i);
  assert.match(combinedOverlay, /shareCardImage/);
  assert.match(combinedOverlay, /portfolio-card\.png/);
  assert.match(combinedOverlay, /FileProvider/);
});
