import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) {
  return fs.readFile(path, 'utf8');
}

test('Google Play release candidate advances to versionCode 26 / versionName 2.4.4', async () => {
  const gradle = await read('android/app/build.gradle');
  const index = await read('public/index.html');

  assert.match(gradle, /applicationId ['"]com\.innative\.halkaarz['"]/);
  assert.match(gradle, /targetSdk 36/);
  assert.match(gradle, /versionCode 26/);
  assert.match(gradle, /versionName ['"]2\.4\.4['"]/);
  assert.match(index, /id="appVersion"[\s\S]*v2\.4\.4\s*•\s*Build 26/);
});
