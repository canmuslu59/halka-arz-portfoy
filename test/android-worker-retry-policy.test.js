import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const workerPath = 'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java';
const policyPath = 'android/app/src/main/java/com/innative/halkaarz/BackgroundRetryPolicy.java';

const read = path => fs.readFile(path, 'utf8');

test('background worker classifies IPO failures instead of silently swallowing them', async () => {
  const worker = await read(workerPath);

  assert.doesNotMatch(worker, /try\s*\{\s*checkIpoCalendar\([^;]+;\s*\}\s*catch\s*\(Exception\s+ignored\)\s*\{\s*\}/s);
  assert.match(worker, /catch\s*\(Exception\s+error\)\s*\{[\s\S]*BackgroundRetryPolicy\.shouldRetry\(error\)/);
  assert.match(worker, /if\s*\(retryNeeded\)\s*return\s+Result\.retry\(\)/);
});

test('quote HTTP failures use the shared retry policy instead of retrying every failure class', async () => {
  const worker = await read(workerPath);

  assert.match(worker, /quoteRetryNeeded\s*\|=\s*BackgroundRetryPolicy\.shouldRetry\(error\)/);
  assert.match(worker, /if\s*\(quoteRetryNeeded\)\s*return\s+Result\.retry\(\)/);
  assert.match(worker, /throw\s+new\s+BackgroundRetryPolicy\.HttpStatusException\(status\)/);
});

test('retry policy distinguishes transient HTTP/network failures from permanent failures', async () => {
  const policy = await read(policyPath);

  assert.match(policy, /status\s*==\s*408/);
  assert.match(policy, /status\s*==\s*425/);
  assert.match(policy, /status\s*==\s*429/);
  assert.match(policy, /status\s*>=\s*500/);
  assert.match(policy, /instanceof\s+IOException/);
  assert.match(policy, /instanceof\s+HttpStatusException/);
});
