import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = path => fs.readFile(path, 'utf8');

test('notification helper reports delivery success and respects Android system notification state', async () => {
  const helper = await read('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java');

  assert.match(helper, /static boolean show\(Context context, Map<String, String> data\)/);
  assert.match(helper, /NotificationManagerCompat\.from\(context\)\.areNotificationsEnabled\(\)/);
  assert.match(helper, /manager\.notify\(/);
  assert.match(helper, /return true;/);
  assert.match(helper, /return false;/);
});

test('background worker stops before network work when Android notifications are disabled', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');

  assert.match(worker, /NotificationManagerCompat\.from\(context\)\.areNotificationsEnabled\(\)/);
  assert.match(worker, /if\s*\([^)]*!NotificationManagerCompat\.from\(context\)\.areNotificationsEnabled\(\)[^)]*\)\s*\{?\s*return Result\.success\(\)/s);
});

test('native dedupe state advances only after NotificationHelper confirms delivery', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');

  assert.match(worker, /boolean showLimitNotification\(/);
  assert.match(worker, /if\s*\(showLimitNotification\([^)]*\)\)\s*\{[^}]*tickerLimits\.put\("ceiling", true\)/s);
  assert.match(worker, /if\s*\(showLimitNotification\([^)]*\)\)\s*\{[^}]*tickerLimits\.put\("floor", true\)/s);
  assert.match(worker, /if\s*\(showPortfolioNotification\([^)]*\)\)\s*\{[^}]*portfolioDelivered\.add\(level\)/s);
  assert.match(worker, /boolean showIpoNotification\(/);
  assert.match(worker, /if\s*\(showIpoNotification\([^)]*\)\)\s*\{[^}]*seen\.add\(/s);
});

test('native IPO dedupe identity includes the offering event, not ticker alone', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');

  assert.match(worker, /ipoEventKey\(/);
  assert.match(worker, /entry\.offerDates/);
  assert.match(worker, /ticker\s*\+\s*"\\|"/);
});
