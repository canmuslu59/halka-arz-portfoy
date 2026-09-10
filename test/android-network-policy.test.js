import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const MAIN = 'android/app/src/main/java/com/innative/halkaarz/MainActivity.java';
const POLICY = 'android/app/src/main/java/com/innative/halkaarz/NativeHttpPolicy.java';
const WORKER = 'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java';

test('native HTTP bridge delegates URL policy and never auto-follows redirects', async () => {
  const java = await fs.readFile(MAIN, 'utf8');
  assert.match(java, /NativeHttpPolicy\.requireAllowed\(/);
  assert.match(java, /NativeHttpPolicy\.resolveRedirect\(/);
  assert.match(java, /setInstanceFollowRedirects\(false\)/);
  assert.doesNotMatch(java, /setInstanceFollowRedirects\(true\)/);
  assert.match(java, /getHeaderField\("Location"\)/);
});

test('background HTTP fetches enforce the same allow-list on initial and redirected URLs', async () => {
  const java = await fs.readFile(WORKER, 'utf8');
  assert.match(java, /NativeHttpPolicy\.requireAllowed\(/);
  assert.match(java, /NativeHttpPolicy\.resolveRedirect\(/);
  assert.match(java, /setInstanceFollowRedirects\(false\)/);
  assert.doesNotMatch(java, /setInstanceFollowRedirects\(true\)/);
  assert.match(java, /getHeaderField\("Location"\)/);
});

test('native HTTP policy uses an exact host allow-list for current data sources', async () => {
  const java = await fs.readFile(POLICY, 'utf8');
  assert.match(java, /query1\.finance\.yahoo\.com/);
  assert.match(java, /www\.ahlatciyatirim\.com\.tr/);
  assert.match(java, /fintables\.com/);
  assert.match(java, /ALLOWED_HOSTS\.contains\(host\)/);
  assert.doesNotMatch(java, /endsWith\(/);
});
