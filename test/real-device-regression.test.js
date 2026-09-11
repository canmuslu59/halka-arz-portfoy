import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Regression coverage for failures reproduced on the physical Android build.
test('IPO calendar binds detail buttons through the multi-element selector helper', async () => {
  const app = await read('public/app.js');
  assert.match(app, /^\s*\$\$\('\[data-pro-ticker\]',\s*list\)\.forEach\(/m);
  assert.doesNotMatch(app, /^\s*\$\('\[data-pro-ticker\]',\s*list\)\.forEach\(/m);
});

test('background portfolio threshold requires every active holding quote', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  assert.doesNotMatch(worker, /validTodayCount\s*==\s*activeCount/);
  assert.match(worker, /validTodayCount\s*>\s*0\s*&&\s*validTodayCount\s*==\s*expectedTodayCount\s*&&\s*previousValue\s*>\s*0/);
});

