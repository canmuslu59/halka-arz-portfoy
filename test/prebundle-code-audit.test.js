import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('removed Google Play review backdoor leaves no callable or hidden UI remnants', async () => {
  const [app, androidApp, proAccess] = await Promise.all([
    read('public/app.js'),
    read('android/app/src/main/assets/www/app.js'),
    read('public/core/pro-access.js'),
  ]);

  for (const source of [app, androidApp, proAccess]) {
    assert.doesNotMatch(source, /enableReviewAccess|reviewAccessForm|reviewAccessCode|Google Play inceleme erişimi|GOOGLE PLAY İNCELEME|status\s*===\s*['"]review['"]/i);
  }
});
