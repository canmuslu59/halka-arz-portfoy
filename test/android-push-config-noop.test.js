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

test('duplicate normalized push config is a true no-op before prefs, scheduler, and network sync', async () => {
  const source = await fs.readFile(PUSH_SYNC, 'utf8');
  const body = methodBody(source, 'static void saveConfig(Context context, String json)', 'static void saveToken(Context context, String token)');

  assert.match(body, /String nextConfig\s*=\s*safe\.toString\(\);/);
  assert.match(body, /String previousConfig\s*=\s*prefs\.getString\(CONFIG_KEY,\s*""\);/);
  assert.match(body, /if\s*\(nextConfig\.equals\(previousConfig\)\)\s*return;/);

  const noOp = body.indexOf('if (nextConfig.equals(previousConfig)) return;');
  const write = body.indexOf('putString(CONFIG_KEY, nextConfig)');
  const schedule = body.indexOf('BackgroundAlertScheduler.sync');
  const network = body.indexOf('syncAsync(context)');
  assert.ok(noOp >= 0 && write > noOp, 'duplicate guard must precede config persistence');
  assert.ok(schedule > noOp, 'duplicate guard must precede scheduler work');
  assert.ok(network > noOp, 'duplicate guard must precede backend sync');
});

test('duplicate FCM token does not rewrite prefs or start another backend sync', async () => {
  const source = await fs.readFile(PUSH_SYNC, 'utf8');
  const body = methodBody(source, 'static void saveToken(Context context, String token)', 'static void syncAsync(Context context)');

  assert.match(body, /String safeToken\s*=\s*token\.trim\(\);/);
  assert.match(body, /String previousToken\s*=\s*prefs\.getString\(TOKEN_KEY,\s*""\);/);
  assert.match(body, /if\s*\(safeToken\.equals\(previousToken\)\)\s*return;/);

  const noOp = body.indexOf('if (safeToken.equals(previousToken)) return;');
  assert.ok(body.indexOf('putString(TOKEN_KEY, safeToken)') > noOp, 'duplicate token guard must precede token persistence');
  assert.ok(body.indexOf('syncAsync(context)') > noOp, 'duplicate token guard must precede backend sync');
});

test('app startup independently restores background scheduling before token refresh', async () => {
  const source = await fs.readFile(MAIN, 'utf8');
  const ensure = source.indexOf('BackgroundAlertScheduler.ensure(this);');
  const refresh = source.indexOf('PushMessagingService.refreshToken(this);');
  assert.ok(ensure >= 0, 'startup must restore scheduler from persisted config');
  assert.ok(refresh > ensure, 'scheduler restoration must not depend on a changed token/config callback');
});
