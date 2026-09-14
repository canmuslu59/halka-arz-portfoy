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

test('Cloudflare config pins a two-minute cron and draft D1 binding without plaintext secrets', async () => {
  const wrangler = await read('wrangler.jsonc');
  assert.match(wrangler, /"crons"\s*:\s*\[\s*"\*\/2 \* \* \* \*"\s*\]/);
  assert.match(wrangler, /"d1_databases"\s*:\s*\[\s*\{\s*"binding"\s*:\s*"DB"\s*\}\s*\]/);
  assert.doesNotMatch(wrangler, /BEGIN PRIVATE KEY|private_key_id/i);
});

test('temporary Cloudflare bootstrap uses an ephemeral public-key envelope and never stores plaintext Firebase credentials', async () => {
  const workflow = await read('.github/workflows/cloudflare-temporary-bootstrap.yml');
  assert.match(workflow, /wrangler@4\.131\.1\s+deploy\s+--temporary/);
  assert.match(workflow, /openssl\s+genpkey/);
  assert.match(workflow, /cloudflare-bootstrap-public-key/);
  assert.match(workflow, /cloudflare-bootstrap-secret\.enc\.json/);
  assert.match(workflow, /pkeyutl\s+-decrypt/);
  assert.match(workflow, /--secrets-file/);
  assert.match(workflow, /d1\s+migrations\s+apply\s+DB\s+--remote/);
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
