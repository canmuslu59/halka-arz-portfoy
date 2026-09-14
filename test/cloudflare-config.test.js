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

test('Cloudflare config pins two-minute cron and SQLite Durable Object persistence without D1', async () => {
  const wrangler = await read('wrangler.jsonc');
  assert.match(wrangler, /"crons"\s*:\s*\[\s*"\*\/2 \* \* \* \*"\s*\]/);
  assert.match(wrangler, /"durable_objects"\s*:/);
  assert.match(wrangler, /"name"\s*:\s*"PUSH_STATE"/);
  assert.match(wrangler, /"class_name"\s*:\s*"PushStateDurableObject"/);
  assert.match(wrangler, /"new_sqlite_classes"\s*:\s*\[\s*"PushStateDurableObject"\s*\]/);
  assert.doesNotMatch(wrangler, /"d1_databases"\s*:/);
  assert.doesNotMatch(wrangler, /BEGIN PRIVATE KEY|private_key_id/i);
});

test('production Worker defaults to the Durable Object store rather than D1', async () => {
  const worker = await read('cloudflare/worker.js');
  assert.match(worker, /createDurableStore/);
  assert.match(worker, /PushStateDurableObject/);
  assert.match(worker, /env\.PUSH_STATE/);
  assert.doesNotMatch(worker, /createD1Store|env\.DB/);
});

test('temporary Cloudflare bootstrap deploys anonymously without D1 provisioning or embedded Firebase credentials', async () => {
  const workflow = await read('.github/workflows/cloudflare-temporary-bootstrap.yml');
  assert.match(workflow, /wrangler@4\.131\.1\s+deploy\s+--temporary/);
  assert.doesNotMatch(workflow, /d1\s+(create|migrations)/i);
  assert.match(workflow, /cloudflare-bootstrap-preview/);
  assert.doesNotMatch(workflow, /FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.doesNotMatch(workflow, /BEGIN PRIVATE KEY/);
  assert.doesNotMatch(workflow, /firebase-adminsdk-[^\s]+@halka-arz-portfoyum/);
});

test('Cloudflare local state and secret env files are ignored', async () => {
  const gitignore = await read('.gitignore');
  assert.match(gitignore, /^\.wrangler\/$/m);
  assert.match(gitignore, /^\.dev\.vars$/m);
  assert.match(gitignore, /^\.dev\.vars\.\*$/m);
});

test('tracked push/config/docs files contain no Firebase private key payload or service-account key metadata', async () => {
  const files = [
    'wrangler.jsonc',
    ...(await collectFiles('cloudflare')),
    ...(await collectFiles('.github/workflows')),
    ...(await collectFiles('docs')),
  ];
  for (const file of files) {
    const text = await read(file);
    assert.doesNotMatch(text, /-----BEGIN PRIVATE KEY-----\s*[A-Za-z0-9+/]{80,}/, `${file} must not contain a PEM private-key payload`);
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
