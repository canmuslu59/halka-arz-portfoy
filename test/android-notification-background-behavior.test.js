import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateDailyAlerts } from '../public/core/notification-rules.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('per-stock percentage moves never emit notifications; portfolio threshold still does', () => {
  const result = evaluateDailyAlerts({
    day:'2026-09-09', threshold:3, enabled:true,
    holdings:[{ticker:'AAA',dailyPct:6.4,currentPrice:106.4,previousClose:100,dailySessionActive:true}],
    portfolioPct:3.2,
  });
  assert.equal(result.events.some(event => event.kind === 'stock'), false);
  assert.deepEqual(result.events.filter(event => event.kind === 'portfolio').map(event => event.level), [3]);
});

test('stock notifications are limited to once-daily ceiling and floor events', () => {
  const ceiling = evaluateDailyAlerts({
    day:'2026-09-09', threshold:1, enabled:true,
    holdings:[{ticker:'AAA',dailyPct:10,currentPrice:110,previousClose:100,dailySessionActive:true}],
    portfolioPct:0,
  });
  assert.deepEqual(ceiling.events.map(event => event.kind), ['ceiling']);
  const repeated = evaluateDailyAlerts({
    day:'2026-09-09', threshold:1, enabled:true,
    holdings:[{ticker:'AAA',dailyPct:10,currentPrice:110,previousClose:100,dailySessionActive:true}],
    portfolioPct:0, previousState:ceiling.state,
  });
  assert.deepEqual(repeated.events, []);

  const floor = evaluateDailyAlerts({
    day:'2026-09-09', threshold:1, enabled:true,
    holdings:[{ticker:'BBB',dailyPct:-10,currentPrice:90,previousClose:100,dailySessionActive:true}],
    portfolioPct:0,
  });
  assert.deepEqual(floor.events.map(event => event.kind), ['floor']);
});

test('Android back button delegates to SPA history first and requires a second root press to exit', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  const app = await read('public/app.js');
  assert.match(main, /EXIT_BACK_WINDOW_MS\s*=\s*2000/);
  assert.match(main, /__handleAndroidBack/);
  assert.doesNotMatch(main, /webView\.canGoBack\(\)/);
  assert.match(app, /window\.__handleAndroidBack\s*=/);
  assert.match(app, /history\.back\(\)/);
  assert.match(app, /navDepth/);
  assert.match(main, /Çıkmak için tekrar geri basın/);
  assert.match(main, /now - lastBackPressMs <= EXIT_BACK_WINDOW_MS[\s\S]*backPressedCallback\.setEnabled\(false\)[\s\S]*getOnBackPressedDispatcher\(\)\.onBackPressed\(\)/);
  assert.doesNotMatch(main, /super\.onBackPressed\(\)/);
});

test('Android schedules network-constrained background market and IPO checks even with an empty portfolio', async () => {
  const gradle = await read('android/app/build.gradle');
  const sync = await read('android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java');
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  const scheduler = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java');
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');

  assert.match(gradle, /androidx\.work:work-runtime:/);
  assert.match(scheduler, /PeriodicWorkRequest\.Builder\([\s\S]*15, TimeUnit\.MINUTES/);
  assert.match(scheduler, /NetworkType\.CONNECTED/);
  assert.match(scheduler, /enqueueUniquePeriodicWork/);
  assert.match(scheduler, /OneTimeWorkRequest/);
  assert.doesNotMatch(scheduler, /holdings\.length\(\)\s*>\s*0/);
  assert.match(sync, /BackgroundAlertScheduler\.sync/);
  assert.doesNotMatch(sync, /holdings\.length\(\)\s*>\s*0/);
  assert.match(main, /BackgroundAlertScheduler\.ensure/);
  assert.match(worker, /extends Worker/);
  assert.match(worker, /query1\.finance\.yahoo\.com\/v8\/finance\/chart/);
  assert.match(worker, /NotificationHelper\.show/);
  assert.match(worker, /"ceiling"/);
  assert.match(worker, /"floor"/);
  assert.match(worker, /"portfolio"/);
  assert.doesNotMatch(worker, /kind",\s*"stock"/);
  assert.match(worker, /background_alert_state_v1/);
});

test('Play milestone identity is versionCode 34 / versionName 2.5.1', async () => {
  const gradle = await read('android/app/build.gradle');
  const html = await read('public/index.html');
  assert.match(gradle, /versionCode 34/);
  assert.match(gradle, /versionName ['"]2\.5\.1['"]/);
  assert.match(html, /v2\.5\.1\s*•\s*Build 34/);
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

test('background alert worker stays independent of MainActivity and WebView', async () => {
  const scheduler = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java');
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  assert.match(scheduler, /PeriodicWorkRequest\.Builder\(BackgroundAlertWorker\.class, 15, TimeUnit\.MINUTES\)/);
  assert.match(scheduler, /enqueueUniquePeriodicWork/);
  assert.match(worker, /NotificationHelper\.show\(context, data\)/);
  assert.doesNotMatch(worker, /MainActivity|WebView/);
});

