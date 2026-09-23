import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) {
  return fs.readFile(path, 'utf8');
}

test('Android API 36 build uses compatible AGP and enables AndroidX', async () => {
  const rootGradle = await read('android/build.gradle');
  const properties = await read('android/gradle.properties');

  assert.match(rootGradle, /com\.android\.application['"] version ['"]8\.10\.1['"]/);
  assert.match(properties, /^android\.useAndroidX=true$/m);
  assert.doesNotMatch(properties, /^android\.useAndroidX=false$/m);
});

test('Milestone release advances the Play identity to Code33', async () => {
  const appGradle = await read('android/app/build.gradle');

  assert.match(appGradle, /versionCode 33/);
  assert.match(appGradle, /versionName ['"]2\.5\.0['"]/);
});

