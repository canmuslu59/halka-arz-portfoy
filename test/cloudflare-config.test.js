import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const read = file => fs.readFile(file, 'utf8');

async function collectFiles(root) {
  const found = [];
  async function walk(current) {
    let entries;
    try { entries = await fs.readdir(current, {withFileTypes:true}); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) found.push(full);
    }
  }
  await walk(root);
  return found;
}

test('Cloudflare config pins a two-minute cron without plaintext secrets', async () => {
  const wrangler = await read('wrangler.jsonc');
  assert.match(wrangler, /"crons"\s*:\s*\[\s*"\*\/2 \* \* \* \*"\s*\]/);
  assert.doesNotMatch(wrangler, /BEGIN PRIVATE KEY|private_key_id/i);
});

test('Cloudflare local state and secret env files are ignored', async () => {
  const gitignore = await read('.gitignore');
  assert.match(gitignore, /^\.wrangler\/$/m);
  assert.match(gitignore, /^\.dev\.vars$/m);
  assert.match(gitignore, /^\.dev\.vars\.\*$/m);
});

test('tracked push/config/docs files contain no Firebase private key material', async () => {
  const files = [
    'wrangler.jsonc',
    ...(await collectFiles('cloudflare')),
    ...(await collectFiles('.github/workflows')),
    ...(await collectFiles('docs')),
  ];
  for (const file of files) {
    const text = await read(file);
    assert.doesNotMatch(text, /-----BEGIN PRIVATE KEY-----/, `${file} must not contain a private key`);
    assert.doesNotMatch(text, /"private_key_id"\s*:/, `${file} must not contain service-account key metadata`);
  }
});

test('Android remains on 15-minute WorkManager fallback and syncs to configured HTTPS backend', async () => {
  const scheduler = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java');
  const pushSync = await read('android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java');
  assert.match(scheduler, /15, TimeUnit\.MINUTES/);
  assert.match(pushSync, /BuildConfig\.PUSH_BACKEND_URL/);
  assert.match(pushSync, /"\/v1\/installations"/);
  assert.match(pushSync, /"https"\.equalsIgnoreCase\(url\.getProtocol\(\)\)/);
});
