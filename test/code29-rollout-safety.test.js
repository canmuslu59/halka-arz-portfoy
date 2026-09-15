import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Code29 disables market alerts on a legacy cloud worker while keeping local market checks enabled', async () => {
  const sync = await read('android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java');
  assert.match(sync, /safe\.put\("marketReferenceProtocol",\s*2\)/);
  assert.match(sync, /remoteConfig\.put\("trustedMarketEnabled",\s*configObject\.optBoolean\("enabled",\s*true\)\)/);
  assert.match(sync, /remoteConfig\.put\("enabled",\s*false\)/);
  assert.match(sync, /body\.put\("config",\s*remoteConfig\)/);
});

test('new cloud worker understands the trusted-reference rollout protocol when deployed', async () => {
  const service = await read('backend/service.js');
  assert.match(service, /marketReferenceProtocol/);
  assert.match(service, /trustedMarketEnabled/);
});
