import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scheduler = readFileSync('android/app/src/main/java/com/innative/halkaarz/NewsTestScheduler.java', 'utf8');
const worker = readFileSync('android/app/src/main/java/com/innative/halkaarz/NewsTestWorker.java', 'utf8');
const activity = readFileSync('android/app/src/main/java/com/innative/halkaarz/MainActivity.java', 'utf8');
const helper = readFileSync('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java', 'utf8');
const pushMessaging = readFileSync('android/app/src/main/java/com/innative/halkaarz/PushMessagingService.java', 'utf8');
const formatter = readFileSync('android/app/src/main/java/com/innative/halkaarz/NewsNotificationFormatter.java', 'utf8');
const previewWorker = readFileSync('android/app/src/main/java/com/innative/halkaarz/NewsTestPreviewWorker.java', 'utf8');

test('local news fallback is enabled for production and graph-test, while preview remains test-only', () => {
  assert.match(scheduler, /"com\.innative\.halkaarz"\.equals\(appId\)/);
  assert.match(scheduler, /BuildConfig\.DEBUG/);
  assert.match(scheduler, /endsWith\("\.graphtest"\)/);
  assert.match(scheduler, /static boolean previewEnabled\(\)/);
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

test('news digest presentation cleans description tails and preserves a visible blank line', () => {
  assert.match(worker, /body\.append\("\\n\\n"\)/);
  assert.match(formatter, /Türkiye Cumhuriyet Merkez Bankası/);
  assert.match(formatter, /TCMB,/);
  assert.match(formatter, /SPK,/);
  assert.match(formatter, /replace\("\\n\\n", "\\n\\u200B\\n"\)/);
  assert.match(formatter, /Ekonomi ve Finans Gündemi/);
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

test('local fallback keeps feed time while opportunistically repairing the true article title', () => {
  assert.match(worker, /parseInstant\(item\.optString\("publishedAt", ""\)\)/);
  assert.match(worker, /Instant publishedAt = candidate\.publishedAt/);
  assert.match(worker, /fetchArticleMetadata\(candidate\.url\)/);
  assert.match(worker, /if \(publishedAt == null\) publishedAt = metadata\.publishedAt/);
  assert.match(worker, /NewsNotificationFormatter\.cleanHeadline/);
});


test('automatic fake digest preview is graph-test only and reproduces the last bad payload for visual regression', () => {
  assert.match(scheduler, /PREVIEW_WORK_PREFIX/);
  assert.match(scheduler, /NewsTestPreviewWorker\.class/);
  assert.match(scheduler, /setInitialDelay\(8, TimeUnit\.SECONDS\)/);
  assert.match(previewWorker, /if \(!NewsTestScheduler\.previewEnabled\(\)\) return Result\.success\(\)/);
  assert.match(previewWorker, /Faiz ve Piyasa Gündemi/);
  assert.match(previewWorker, /Finansal Hizmetler Güven Endeksi Eylül'de arttı Türkiye Cumhuriyet Merkez Bankası/);
  assert.match(previewWorker, /Tasfiye edilen 131 fondaki yatırımcı sayısı açıklandı SPK,/);
  assert.match(previewWorker, /TCMB'den bir elektronik para kuruluşuna faaliyet izni iptali TCMB,/);
});

test('digest formatting is isolated from market notification kinds', () => {
  assert.match(helper, /if \("news_digest"\.equals\(kind\)\)/);
  assert.match(helper, /NewsNotificationFormatter\.digestTitle/);
  assert.match(helper, /NewsNotificationFormatter\.spacedDigestBody/);
  assert.doesNotMatch(formatter, /ceiling|floor|portfolio_fall/);
});
