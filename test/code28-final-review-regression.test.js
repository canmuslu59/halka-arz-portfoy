import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('push payload carries sale facts needed for foreground/backend daily return parity', async () => {
  const app = await read('public/app.js');
  assert.match(app, /ipoPrice\s*:\s*Number\(item\.ipoPrice/);
  assert.match(app, /sales\s*:\s*\(Array\.isArray\(item\.sales\)/);
  assert.match(app, /currentLots[\s\S]{0,220}sales/);
});

test('native fallback reconstructs start-of-day lots and sale-day withholding', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  assert.match(worker, /soldTodayLots/);
  assert.match(worker, /todayWithholdingTax/);
  assert.match(worker, /0\.175/);
  assert.match(worker, /dailyBaseLots/);
});

test('realized-gain withholding is disclosed only after a taxable sale', async () => {
  const app = await read('public/app.js');
  assert.match(app, /Stopaj \(%17,5\)/);
  assert.match(app, /Number\(h\.withholdingTax\s*\|\|\s*0\)\s*>\s*0/);
});

test('push sync marks success only after HTTP 2xx and unsynced duplicates remain retryable', async () => {
  const sync = await read('android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java');
  assert.match(sync, /SYNCED_FINGERPRINT_KEY/);
  assert.match(sync, /responseCode\s*>=\s*200\s*&&\s*responseCode\s*<\s*300/);
  assert.match(sync, /ensureSynced\s*\(/);
  assert.match(sync, /registrationFingerprint/);
});