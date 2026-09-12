import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateTotals } from '../public/core/domain.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('portfolio totals explicitly report incomplete active market values and suppress partial aggregate values', () => {
  const totals = calculateTotals([
    { invested:100, activeValue:120, salesProceeds:0, totalWealth:120, totalProfit:20, realizedProfit:0, unrealizedProfit:20, dailyProfit:2, previousClose:118, currentLots:1, dailySessionActive:true },
    { invested:200, activeValue:null, salesProceeds:0, totalWealth:null, totalProfit:null, realizedProfit:0, unrealizedProfit:null, dailyProfit:null, previousClose:null, currentLots:2, dailySessionActive:true },
  ]);
  assert.equal(totals.complete, false);
  assert.equal(totals.missingActiveValueCount, 1);
  assert.equal(totals.missingDailyValueCount, 1);
  assert.equal(totals.totalWealth, null);
  assert.equal(totals.activeValue, null);
  assert.equal(totals.totalProfit, null);
  assert.equal(totals.dailyProfit, null);
});

test('review access code is not embedded in public JavaScript', async () => {
  const pro = await read('public/core/pro-access.js');
  assert.doesNotMatch(pro, /GPLAY-REVIEW-|REVIEW_ACCESS_CODE\s*=\s*['"]/);
  assert.match(pro, /enableReviewAccess\(\)[\s\S]{0,120}return false/);
});

test('Google Play review form is hidden from normal users', async () => {
  const html = await read('public/index.html');
  assert.match(html, /\.review-access-box\{display:none!important\}/);
});

test('Ahlatci archive discovery is not hard limited to twelve pages', async () => {
  const source = await read('public/core/data-sources.js');
  assert.doesNotMatch(source, /Array\.from\(\{ length:\s*11 \}/);
  assert.match(source, /MAX_AHLATCI_ARCHIVE_PAGES/);
  assert.match(source, /hasNextAhlatciPage/);
  assert.match(source, /newResults/);
  assert.match(source, /pageNumber/);
});

test('privacy disclosure explicitly says remote sync can include ticker and lot quantities', async () => {
  const privacy = await read('public/privacy.html');
  assert.match(privacy, /HTTPS[\s\S]{0,420}(?:hisse kod|ticker)[\s\S]{0,180}lot|(?:hisse kod|ticker)[\s\S]{0,180}lot[\s\S]{0,420}HTTPS/i);
});

test('Android exposes notification diagnostics, notification settings recovery, without a test notification trigger', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  const helper = await read('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java');
  assert.match(main, /getNotificationStatus/);
  assert.match(main, /openNotificationSettings/);
  assert.doesNotMatch(main, /showDebugTestNotification|isDebugBuild/);
  assert.match(main, /shouldShowRequestPermissionRationale/);
  assert.match(helper, /diagnosticStatus/);
  assert.match(helper, /getImportance\(\)/);
  assert.match(helper, /areNotificationsEnabled\(\)/);
});

test('production milestone UI removes the test notification control while retaining notification recovery', async () => {
  const html = await read('public/index.html');
  const recovery = await read('public/notification-recovery.js');
  assert.doesNotMatch(html, /debugNotificationTest/);
  assert.doesNotMatch(html, /Test bildirimi gönder/);
  assert.doesNotMatch(recovery, /isDebugBuild/);
  assert.doesNotMatch(recovery, /showDebugTestNotification|debugNotificationTest/);
  assert.match(recovery, /openNotificationSettings/);
});

test('permission result and app resume re-ensure background alert scheduling', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.match(main, /handleNotificationPermissionResult[\s\S]*BackgroundAlertScheduler\.ensure\(this\)/);
  assert.match(main, /onResume\(\)[\s\S]*BackgroundAlertScheduler\.ensure\(this\)/);
});

test('finding 3 purchase flow and finding 6 market calendar remain untouched by this fix set', async () => {
  const app = await read('public/app.js');
  const calendar = await read('public/core/market-calendar.js');
  assert.match(app, /pro-buy-disabled/);
  assert.match(calendar, /CLOSED_2026/);
  assert.match(calendar, /CLOSED_2027/);
  assert.doesNotMatch(calendar, /CLOSED_2028/);
});

