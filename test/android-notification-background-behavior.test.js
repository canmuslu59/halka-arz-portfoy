import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) {
  return fs.readFile(path, 'utf8');
}

test('per-stock percentage moves never emit notifications; portfolio threshold still does', async () => {
  const app = await read('public/app.js');
  assert.doesNotMatch(app, /kind:\s*['"]stock['"]/);
  assert.match(app, /kind:\s*['"]portfolio['"]/);
});

test('stock notifications are limited to once-daily ceiling and floor events', async () => {
  const app = await read('public/app.js');
  assert.match(app, /kind:\s*['"]ceiling['"]/);
  assert.match(app, /kind:\s*['"]floor['"]/);
});

test('Android back button delegates to SPA history first and requires a second root press to exit', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.match(main, /Boolean\(window\.__handleAndroidBack/);
  assert.match(main, /EXIT_BACK_WINDOW_MS\s*=\s*2000L/);
  assert.match(main, /now - lastBackPressMs <= EXIT_BACK_WINDOW_MS[\s\S]*backPressedCallback\.setEnabled\(false\)[\s\S]*getOnBackPressedDispatcher\(\)\.onBackPressed\(\)/);
  assert.doesNotMatch(main, /super\.onBackPressed\(\)/);
});

test('Android schedules network-constrained background market and IPO checks even with an empty portfolio', async () => {
  const scheduler = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java');
  assert.match(scheduler, /NetworkType\.CONNECTED/);
  assert.match(scheduler, /OneTimeWorkRequest/);
  assert.match(scheduler, /PeriodicWorkRequest/);
  assert.match(scheduler, /BackgroundAlertWorker/);
});

test('Play update identity advances to versionCode 22 / versionName 2.4.0', async () => {
  const gradle = await read('android/app/build.gradle');
  const html = await read('public/index.html');
  assert.match(gradle, /versionCode 22/);
  assert.match(gradle, /versionName ['"]2\.4\.0['"]/);
  assert.match(html, /v2\.4\.0\s*•\s*Build 22/);
});

test('Android requests notification permission automatically on app startup when still missing', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  const app = await read('public/app.js');
  assert.match(main, /requestStartupNotificationPermission/);
  assert.match(main, /webView\.postDelayed\([\s\S]*requestStartupNotificationPermission/);
  assert.match(main, /ContextCompat\.checkSelfPermission\(this, Manifest\.permission\.POST_NOTIFICATIONS\)\s*==\s*PackageManager\.PERMISSION_GRANTED/);
  assert.match(main, /notificationPermissionLauncher\.launch\(Manifest\.permission\.POST_NOTIFICATIONS\)/);
  assert.match(main, /requestStartupNotificationPermission[\s\S]{0,1200}NOTIFICATION_ASKED_KEY/);
  assert.doesNotMatch(app, /setTimeout\(maybeRequestNotificationPermissionOnce/);
});

test('notification helper reports delivery success and respects Android system notification state', async () => {
  const helper = await read('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java');
  assert.match(helper, /static boolean show/);
  assert.match(helper, /areNotificationsEnabled\(\)/);
  assert.match(helper, /return true;/);
  assert.match(helper, /return false;/);
});

test('background worker stops before network work when Android notifications are disabled', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  assert.match(worker, /areNotificationsEnabled\(\)/);
  assert.match(worker, /return Result\.success\(\)/);
});

test('native dedupe state advances only after NotificationHelper confirms delivery', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  assert.match(worker, /NotificationHelper\.show/);
  assert.match(worker, /if \(delivered\)/);
});

test('native IPO dedupe identity includes the offering event, not ticker alone', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  assert.match(worker, /offerDates/);
  assert.match(worker, /ticker/);
});

test('background worker has native IPO fetch, de-dup state and notification permission guard', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  assert.match(worker, /extends Worker/);
  assert.match(worker, /query1\.finance\.yahoo\.com\/v8\/finance\/chart/);
  assert.match(worker, /NotificationHelper\.show/);
  assert.match(worker, /"ceiling"/);
  assert.match(worker, /"floor"/);
  assert.match(worker, /"portfolio"/);
  assert.doesNotMatch(worker, /kind",\s*"stock"/);
  assert.match(worker, /background_alert_state_v1/);
});