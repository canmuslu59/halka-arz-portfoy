import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = file => fs.readFile(file, 'utf8');

test('Android build declares Google Services plugin but only applies it when config is present', async () => {
  const [rootGradle, appGradle] = await Promise.all([
    read('android/build.gradle'),
    read('android/app/build.gradle'),
  ]);
  assert.match(rootGradle, /com\.google\.gms\.google-services['"]\s+version\s+['"][^'"]+['"]\s+apply false/);
  assert.match(appGradle, /file\(['"]google-services\.json['"]\)\.exists\(\)/);
  assert.match(appGradle, /apply plugin:\s*['"]com\.google\.gms\.google-services['"]/);
});

test('code28 release workflow injects Firebase client config and refuses an empty or non-HTTPS push backend URL', async () => {
  const workflow = await read('.github/workflows/code28-notifications.yml');
  assert.match(workflow, /GOOGLE_SERVICES_JSON_BASE64:\s*\$\{\{\s*secrets\.GOOGLE_SERVICES_JSON_BASE64\s*\}\}/);
  assert.match(workflow, /base64\s+--decode[^\n]*android\/app\/google-services\.json/);
  assert.match(workflow, /PUSH_BACKEND_URL:\s*\$\{\{\s*secrets\.PUSH_BACKEND_URL\s*\}\}/);
  assert.match(workflow, /https:\/\//);
  assert.match(workflow, /exit\s+1/);
});
