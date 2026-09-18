import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) {
  return fs.readFile(path, 'utf8');
}

test('milestone release is v2.4.8 / code31', async () => {
  const gradle = await read('android/app/build.gradle');
  const index = await read('public/index.html');

  assert.match(gradle, /applicationId ['"]com\.innative\.halkaarz['"]/);
  assert.match(gradle, /targetSdk 36/);
  assert.match(gradle, /versionCode 31/);
  assert.match(gradle, /versionName ['"]2\.4\.6['"]/);
  assert.match(index, /id="appVersion"[\s\S]*v2\.4\.6\s*•\s*Build 31/);
});

test('milestone release source exposes no test notification button', async () => {
  const index = await read('public/index.html');
  assert.doesNotMatch(index, /debugNotificationTest/);
  assert.doesNotMatch(index, /Test bildirimi gönder/);
});

