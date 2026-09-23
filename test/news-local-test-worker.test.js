import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scheduler = readFileSync('android/app/src/main/java/com/innative/halkaarz/NewsTestScheduler.java', 'utf8');
const worker = readFileSync('android/app/src/main/java/com/innative/halkaarz/NewsTestWorker.java', 'utf8');
const activity = readFileSync('android/app/src/main/java/com/innative/halkaarz/MainActivity.java', 'utf8');
const helper = readFileSync('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java', 'utf8');
const pushMessaging = readFileSync('android/app/src/main/java/com/innative/halkaarz/PushMessagingService.java', 'utf8');

test('local news fallback is guarded to the debug graph-test package only', () => {
  assert.match(scheduler, /BuildConfig\.DEBUG/);
  assert.match(scheduler, /BuildConfig\.APPLICATION_ID/);
  assert.match(scheduler, /endsWith\("\.graphtest"\)/);
});

test('local news fallback schedules immediate, 10:00, 19:00 and 15-minute catch-up checks', () => {
  assert.match(scheduler, /IMMEDIATE_WORK/);
  assert.match(scheduler, /MORNING_WORK/);
  assert.match(scheduler, /EVENING_WORK/);
  assert.match(scheduler, /delayUntil\(now, 10, 0\)/);
  assert.match(scheduler, /delayUntil\(now, 19, 0\)/);
  assert.match(scheduler, /setInitialDelay/);
  assert.match(scheduler, /ExistingWorkPolicy\.REPLACE/);
  assert.match(scheduler, /PeriodicWorkRequest\.Builder\(NewsTestWorker\.class, 15, TimeUnit\.MINUTES\)/);
  assert.match(activity, /NewsTestScheduler\.ensure\(this\)/);
});

test('local news fallback rejects Bloomberg landing pages and resolves source metadata', () => {
  assert.match(worker, /Pattern\.compile\("-\\\\d\{6,\}\/\?\$"/);
  assert.match(worker, /article:published_time/);
  assert.match(worker, /og:title/);
});

test('local digest uses one blank line between summaries and dynamic finance titles', () => {
  assert.match(worker, /body\.append\("\\n\\n"\)/);
  assert.match(worker, /Faiz ve Piyasa Gündemi/);
  assert.match(worker, /Borsa ve Altın Gündemi/);
  assert.match(worker, /Finans Gündeminde Öne Çıkanlar/);
});

test('local breaking path keeps critical threshold at 5 of 5 and ninety-minute age', () => {
  assert.match(worker, /BREAKING_MAX_AGE_MINUTES = 90L/);
  assert.match(worker, /item\.importance == 5/);
  assert.match(worker, /news_breaking/);
});


test('local news worker reschedules daily targets and records digest diagnostics', () => {
  assert.match(worker, /NewsTestScheduler\.scheduleDailyTargets\(app\)/);
  assert.match(worker, /LAST_RUN_AT/);
  assert.match(worker, /LAST_DIGEST_ATTEMPT_AT/);
  assert.match(worker, /LAST_DIGEST_DELIVERED/);
  assert.match(helper, /newsTest/);
  assert.match(helper, /nextMorningTargetAt/);
  assert.match(helper, /nextEveningTargetAt/);
});


test('graph test keeps the production FCM delivery path for news and market pushes', () => {
  assert.match(pushMessaging, /NotificationHelper\.show\(this, message\.getData\(\)\)/);
  assert.doesNotMatch(pushMessaging, /isolatedNewsTest/);
  assert.doesNotMatch(pushMessaging, /news_breaking.*return;/s);
  assert.doesNotMatch(pushMessaging, /news_digest.*return;/s);
});

test('local fallback prefers feed publication time before source-page verification', () => {
  assert.match(worker, /parseInstant\(item\.optString\("publishedAt", ""\)\)/);
  assert.match(worker, /if \(candidate\.publishedAt != null\)/);
  assert.match(worker, /verified\.add\(candidate\)/);
  assert.match(worker, /fetchArticleMetadata\(candidate\.url\)/);
});
