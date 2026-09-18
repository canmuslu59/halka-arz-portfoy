import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) { return fs.readFile(path, 'utf8'); }

test('Premium Test fake notifications are package-guarded and schedule four random slots', async () => {
  const scheduler = await read('android/app/src/main/java/com/innative/halkaarz/PremiumTestNotificationScheduler.java');
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/PremiumTestNotificationWorker.java');
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');

  assert.match(scheduler, /BuildConfig\.APPLICATION_ID\.endsWith\("\.premiumtest"\)/);
  assert.match(worker, /BuildConfig\.APPLICATION_ID\.endsWith\("\.premiumtest"\)/);
  assert.match(scheduler, /NOTIFICATIONS_PER_BATCH\s*=\s*4/);
  assert.match(scheduler, /MIN_DELAY_SECONDS\s*=\s*3\s*\*\s*60/);
  assert.match(scheduler, /MAX_DELAY_SECONDS\s*=\s*57\s*\*\s*60/);
  assert.match(scheduler, /new PeriodicWorkRequest\.Builder[\s\S]*1,[\s\S]*TimeUnit\.HOURS/);
  assert.match(worker, /TEST — Bildirim sistemi/);
  assert.match(worker, /Sahte Premium test bildirimi/);
  assert.match(main, /PremiumTestNotificationScheduler\.ensure\(this\)/);
});

test('Premium fake notification worker reuses live NotificationHelper without modifying live channels', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/PremiumTestNotificationWorker.java');
  assert.match(worker, /NotificationHelper\.show\(getApplicationContext\(\), data\)/);
  assert.match(worker, /data\.put\("kind", "test"\)/);
  assert.match(worker, /data\.put\("ticker", "TEST"\)/);
});
