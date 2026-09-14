import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const PUSH_SYNC = 'android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java';
const MAIN = 'android/app/src/main/java/com/innative/halkaarz/MainActivity.java';

function methodBody(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing ${signature}`);
  const end = nextSignature ? source.indexOf(nextSignature, start + signature.length) : source.length;
  assert.notEqual(end, -1, `missing ${nextSignature}`);
  return source.slice(start, end);
}

test('duplicate normalized push config avoids mutation but retries an unsynced registration', async () => {
  const source = await fs.readFile(PUSH_SYNC, 'utf8');
  const body = methodBody(source, 'static void saveConfig(Context context, String json)', 'static void saveToken(Context context, String token)');

  assert.match(body, /String nextConfig\s*=\s*safe\.toString\(\);/);
  assert.match(body, /String previousConfig\s*=\s*prefs\.getString\(CONFIG_KEY,\s*""\);/);
  assert.match(body, /if\s*\(nextConfig\.equals\(previousConfig\)\)\s*\{[\s\S]*?ensureSynced\(context\);[\s\S]*?return;[\s\S]*?\}/);

  const guard = body.indexOf('if (nextConfig.equals(previousConfig))');
  const retry = body.indexOf('ensureSynced(context);', guard);
  const write = body.indexOf('putString(CONFIG_KEY, nextConfig)');
  const schedule = body.indexOf('BackgroundAlertScheduler.sync');
  assert.ok(guard >= 0 && retry > guard, 'duplicate config must check whether backend registration still needs retry');
  assert.ok(write > retry, 'duplicate config must not rewrite persisted config');
  assert.ok(schedule > retry, 'duplicate config must not reschedule work unnecessarily');
});

test('duplicate FCM token avoids mutation but retries an unsynced registration', async () => {
  const source = await fs.readFile(PUSH_SYNC, 'utf8');
  const body = methodBody(source, 'static void saveToken(Context context, String token)', 'static void ensureSynced(Context context)');

  assert.match(body, /String safeToken\s*=\s*token\.trim\(\);/);
  assert.match(body, /String previousToken\s*=\s*prefs\.getString\(TOKEN_KEY,\s*""\);/);
  assert.match(body, /if\s*\(safeToken\.equals\(previousToken\)\)\s*\{[\s\S]*?ensureSynced\(context\);[\s\S]*?return;[\s\S]*?\}/);

  const guard = body.indexOf('if (safeToken.equals(previousToken))');
  const retry = body.indexOf('ensureSynced(context);', guard);
  assert.ok(retry > guard, 'duplicate token must retry only when the registration fingerprint is still unsynced');
  assert.ok(body.indexOf('putString(TOKEN_KEY, safeToken)') > retry, 'duplicate token must not rewrite prefs');
});

test('push backend syncs are serialized so an older request cannot finish after a newer one', async () => {
  const source = await fs.readFile(PUSH_SYNC, 'utf8');
  const body = methodBody(source, 'static void syncAsync(Context context)', 'private static void sync(Context context)');

  assert.match(source, /private\s+static\s+final\s+ExecutorService\s+SYNC_EXECUTOR\s*=\s*Executors\.newSingleThreadExecutor/,
    'push sync must share one process-wide serial executor');
  assert.doesNotMatch(body, /new\s+Thread\s*\(/,
    'syncAsync must not start an independent raw thread per settings change');
  assert.match(body, /SYNC_EXECUTOR\.execute\s*\(\s*\(\)\s*->\s*sync\(app\)\s*\)/,
    'every sync must be queued on the shared serial executor');
});

test('app startup independently restores background scheduling before token refresh', async () => {
  const source = await fs.readFile(MAIN, 'utf8');
  const ensure = source.indexOf('BackgroundAlertScheduler.ensure(this);');
  const refresh = source.indexOf('PushMessagingService.refreshToken(this);');
  assert.ok(ensure >= 0, 'startup must restore scheduler from persisted config');
  assert.ok(refresh > ensure, 'scheduler restoration must not depend on a changed token/config callback');
});