import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateTotals } from '../public/core/domain.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('portfolio totals explicitly report incomplete active market values', () => {
  const totals = calculateTotals([
    { invested:100, activeValue:120, salesProceeds:0, totalWealth:120, totalProfit:20, realizedProfit:0, unrealizedProfit:20, dailyProfit:2, previousClose:118, currentLots:1, dailySessionActive:true },
    { invested:200, activeValue:null, salesProceeds:0, totalWealth:null, totalProfit:null, realizedProfit:0, unrealizedProfit:null, dailyProfit:null, previousClose:null, currentLots:2, dailySessionActive:true },
  ]);
  assert.equal(totals.complete, false);
  assert.equal(totals.missingActiveValueCount, 1);
  assert.equal(totals.missingDailyValueCount, 1);
});

test('portfolio UI never labels an incomplete partial value as the complete total', async () => {
  const app = await read('public/app.js');
  assert.match(app, /totals\.complete|t\.complete/);
  assert.match(app, /Eksik fiyat|eksik fiyat|Veri eksik/);
});

test('review access code is not embedded in public JavaScript', async () => {
  const pro = await read('public/core/pro-access.js');
  assert.doesNotMatch(pro, /GPLAY-REVIEW-|REVIEW_ACCESS_CODE\s*=\s*['"]/);
});

test('Google Play review form is conditional rather than visible to every locked user', async () => {
  const app = await read('public/app.js');
  assert.match(app, /reviewAvailable/);
  assert.doesNotMatch(app, /<div class="review-access-box">[\s\S]*GOOGLE PLAY İNCELEME[\s\S]*<form id="reviewAccessForm"/);
});

test('Ahlatci archive discovery is not hard limited to twelve pages', async () => {
  const source = await read('public/core/data-sources.js');
  assert.doesNotMatch(source, /Array\.from\(\{ length:\s*11 \}/);
  assert.match(source, /MAX_AHLATCI_ARCHIVE_PAGES|hasNext|newResults|pageNumber/);
});

test('privacy disclosure explicitly says remote sync can include ticker and lot quantities', async () => {
  const privacy = await read('public/privacy.html');
  assert.match(privacy, /HTTPS[\s\S]{0,260}(?:hisse kod|ticker)[\s\S]{0,160}lot|(?:hisse kod|ticker)[\s\S]{0,160}lot[\s\S]{0,260}HTTPS/i);
});

test('Android exposes notification diagnostics, notification settings recovery, and debug-only native test trigger', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  const helper = await read('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java');
  assert.match(main, /getNotificationStatus/);
  assert.match(main, /openNotificationSettings/);
  assert.match(main, /showDebugTestNotification/);
  assert.match(main, /BuildConfig\.DEBUG/);
  assert.match(helper, /diagnosticStatus|channel.*importance|areNotificationsEnabled/s);
});

test('test notification UI is capability gated and release build cannot expose it unconditionally', async () => {
  const app = await read('public/app.js');
  assert.match(app, /debugNotificationsAvailable|isDebugBuild|debug.*notification/i);
  assert.match(app, /Test bildirimi|test bildirimi/i);
  assert.match(app, /showDebugTestNotification/);
});

test('permission result re-ensures background alert scheduling', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.match(main, /handleNotificationPermissionResult[\s\S]*BackgroundAlertScheduler\.ensure\(this\)/);
});

test('finding 3 purchase flow and finding 6 market calendar remain untouched by this fix set', async () => {
  const app = await read('public/app.js');
  const calendar = await read('public/core/market-calendar.js');
  assert.match(app, /pro-buy-disabled/);
  assert.match(calendar, /CLOSED_2026/);
  assert.match(calendar, /CLOSED_2027/);
  assert.doesNotMatch(calendar, /CLOSED_2028/);
});
