import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) { return fs.readFile(path, 'utf8'); }

test('separate test APK workflow requires Firebase config for com.innative.halkaarz.test', async () => {
  const workflow = await read('.github/workflows/popular-finance-news-test-apk.yml');
  assert.match(workflow, /GOOGLE_SERVICES_TEST_JSON_BASE64/);
  assert.match(workflow, /android\/app\/google-services\.json/);
  assert.match(workflow, /com\.innative\.halkaarz\.test/);
  assert.match(workflow, /google_app_id/);
  assert.match(workflow, /gcm_defaultSenderId/);
  assert.doesNotMatch(workflow, /firebase=not configured/i);
});

test('test Firebase bootstrap workflow never prints secret values', async () => {
  const workflow = await read('.github/workflows/test-firebase-secret-probe.yml');
  assert.match(workflow, /FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.match(workflow, /FIREBASE_ADMIN_JSON/);
  assert.match(workflow, /FIREBASE_ADMIN_SDK_JSON/);
  assert.match(workflow, /GOOGLE_SERVICES_TEST_JSON_BASE64/);
  assert.match(workflow, /=present/);
  assert.match(workflow, /=missing/);
  assert.doesNotMatch(workflow, /echo\s+"?\$\{?(FIREBASE_SERVICE_ACCOUNT_JSON|FIREBASE_ADMIN_JSON|FIREBASE_ADMIN_SDK_JSON|GOOGLE_SERVICES_TEST_JSON_BASE64)/);
});
