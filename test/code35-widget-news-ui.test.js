import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const info = readFileSync('android/app/src/main/res/xml/wallet_widget_info.xml','utf8');
const layout = readFileSync('android/app/src/main/res/layout/wallet_widget.xml','utf8');
const provider = readFileSync('android/app/src/main/java/com/innative/halkaarz/WalletWidgetProvider.java','utf8');
const activity = readFileSync('android/app/src/main/java/com/innative/halkaarz/MainActivity.java','utf8');
const html = readFileSync('public/index.html','utf8');
const css = readFileSync('public/styles.css','utf8');
const app = readFileSync('public/app.js','utf8');
const newsOverlay = readFileSync('scripts/apply-test-popular-finance-news.mjs','utf8');

test('wallet widget is compact 4 by 1 and replaces active value with daily percent', () => {
  assert.match(info, /android:minHeight="55dp"/);
  assert.match(info, /android:targetCellHeight="1"/);
  assert.match(info, /android:targetCellWidth="4"/);
  assert.doesNotMatch(layout, /widget_active/);
  assert.match(layout, /widget_daily_pct/);
  assert.match(layout, />Günlük %</);
  assert.match(provider, /R\.id\.widget_daily_pct/);
  assert.doesNotMatch(provider, /R\.id\.widget_active/);
});

test('first-open widget suggestion is branded in-app UI instead of native AlertDialog', () => {
  assert.doesNotMatch(activity, /AlertDialog/);
  assert.match(activity, /walletWidgetPromoPending/);
  assert.match(activity, /__showWalletWidgetPromo/);
  assert.match(activity, /@JavascriptInterface\s+public void requestWalletWidgetPin\(/s);
  assert.match(html, /id="walletWidgetPromo"/);
  assert.match(html, /Cüzdanınız tek bakışta görünsün/);
  assert.match(html, /<svg viewBox="0 0 320 176"/);
  assert.match(css, /\.widget-promo-card/);
  assert.match(app, /window\.__showWalletWidgetPromo/);
  assert.match(app, /requestWalletWidgetPin/);
});

test('light theme keeps total portfolio value readable', () => {
  assert.match(css, /html\[data-theme="light"\] \.hero-value\{color:var\(--text\)!important\}/);
});

test('visible finance-news screen auto refreshes every two minutes', () => {
  assert.match(newsOverlay, /loadPopularFinanceNews\(\{ force:true \}\); \}, 120_000\)/);
});
