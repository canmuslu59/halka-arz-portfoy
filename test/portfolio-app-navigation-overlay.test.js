import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const navigationOverlayUrl = new URL('../scripts/apply-test-portfolio-app-navigation.mjs', import.meta.url);
const navigationOverlay = existsSync(navigationOverlayUrl) ? readFileSync(navigationOverlayUrl, 'utf8') : '';
const walletOverlay = read('../scripts/apply-test-wallet-metrics-nav.mjs');
const combinedOverlay = [
  read('../scripts/apply-test-share-ui.mjs'),
  walletOverlay,
  navigationOverlay,
].join('\n');

function extractedReplaceOnce() {
  const match = navigationOverlay.match(/function replaceOnce\(text, needle, replacement, label\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'replaceOnce helper must exist');
  return Function(`${match[0]}; return replaceOnce;`)();
}

test('overlay replacement preserves literal double-dollar selectors used by querySelectorAll helper', () => {
  const replaceOnce = extractedReplaceOnce();
  assert.equal(
    replaceOnce('NAV_BIND', 'NAV_BIND', "$$('.nav-tab').forEach(() => {});", 'navigation listeners'),
    "$$('.nav-tab').forEach(() => {});",
  );
});

test('bottom navigation is Holdings, Performance, centered Wallet, Markets and Settings', () => {
  assert.match(navigationOverlay, /id="holdingsView"/);
  assert.match(navigationOverlay, /data-view="holdings"/);
  assert.match(navigationOverlay, />Hisselerim<\/b>/);
  assert.match(navigationOverlay, /id="performanceView"/);
  assert.match(navigationOverlay, /data-view="performance"/);
  assert.match(navigationOverlay, />Performans<\/b>/);
  assert.match(combinedOverlay, /id="walletHomeTab"/);
  assert.match(combinedOverlay, /data-view="portfolio"/);
  assert.match(navigationOverlay, /id="marketsTab"/);
  assert.match(navigationOverlay, /data-view="markets"/);
  assert.match(navigationOverlay, />Piyasalar<\/b>/);
  assert.match(navigationOverlay, /holdings:\s*\{\s*title:'Hisselerim'\s*\}/);
  assert.match(navigationOverlay, /markets:\s*\{\s*title:'Piyasalar'\s*\}/);
  assert.match(navigationOverlay, /normalizedView = view === 'calendar' \? 'markets' : view/);
  assert.match(navigationOverlay, /\$\('#addFab'\)\) \$\('#addFab'\)\.hidden = next !== 'holdings'/);
  assert.match(navigationOverlay, /remove advanced navigation/i);
});

test('wallet home keeps only wallet and comparison cards while holdings move into their own view', () => {
  assert.match(navigationOverlay, /holdingsContent/);
  assert.match(navigationOverlay, /holdingsEnd/);
  assert.match(navigationOverlay, /id="holdingsView"/);
  assert.match(navigationOverlay, /wallet home only two cards/i);
  assert.match(navigationOverlay, /portfolioView/);
  assert.match(navigationOverlay, /comparisonCard/);
});

test('wallet comparison is proportioned as a focused daily weekly monthly card with four references', () => {
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
  assert.match(navigationOverlay, /min-height:18[0-9]px/);
  assert.doesNotMatch(navigationOverlay, /comparisonSummary/);
  assert.doesNotMatch(navigationOverlay, /comparisonStatus/);
});

test('holdings have resilient company-logo avatars with uppercase first-letter fallback', () => {
  assert.match(navigationOverlay, /holding-logo-avatar/);
  assert.match(navigationOverlay, /holding-logo-fallback/);
  assert.match(navigationOverlay, /holding-logo/);
  assert.match(navigationOverlay, /hydrateHoldingLogo/);
  assert.match(navigationOverlay, /fetchHoldingLogoUrl/);
  assert.match(navigationOverlay, /https:\/\/fintables\.com\/sirketler\//);
  assert.match(navigationOverlay, /charAt\(0\)\.toLocaleUpperCase\('tr-TR'\)/);
  assert.match(navigationOverlay, /logo\.addEventListener\('error'/);
});

test('light theme explicitly covers newly introduced cards controls and stock avatars', () => {
  assert.match(navigationOverlay, /html\[data-theme="light"\] \.portfolio-comparison-card/);
  assert.match(navigationOverlay, /html\[data-theme="light"\] \.comparison-range-btn/);
  assert.match(navigationOverlay, /html\[data-theme="light"\] \.market-summary-item/);
  assert.match(navigationOverlay, /html\[data-theme="light"\] \.holding-logo-avatar/);
  assert.match(navigationOverlay, /html\[data-theme="light"\] \.icon-btn/);
  assert.match(navigationOverlay, /html\[data-theme="light"\] \.close-btn/);
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
