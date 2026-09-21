import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scheduler = readFileSync('android/app/src/main/java/com/innative/halkaarz/NewsTestScheduler.java', 'utf8');
const worker = readFileSync('android/app/src/main/java/com/innative/halkaarz/NewsTestWorker.java', 'utf8');
const activity = readFileSync('android/app/src/main/java/com/innative/halkaarz/MainActivity.java', 'utf8');

test('local news fallback is guarded to debug news-test backend only', () => {
  assert.match(scheduler, /BuildConfig\.DEBUG/);
  assert.match(scheduler, /halka-arz-portfoy-push-news-test/);
});

test('local news fallback schedules immediate plus Android minimum 15-minute periodic checks', () => {
  assert.match(scheduler, /OneTimeWorkRequest\.Builder\(NewsTestWorker\.class\)/);
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
