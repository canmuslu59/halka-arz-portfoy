import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const mainPath = 'android/app/src/main/java/com/innative/halkaarz/MainActivity.java';

async function mainSource() {
  return fs.readFile(mainPath, 'utf8');
}

test('native HTTP executor is scoped to the Activity lifecycle', async () => {
  const java = await mainSource();
  assert.doesNotMatch(java, /static\s+final\s+ExecutorService\s+NETWORK_EXECUTOR/);
  assert.match(java, /private\s+final\s+ExecutorService\s+networkExecutor\s*=\s*new ThreadPoolExecutor\(/);
  assert.match(java, /networkExecutor\.execute\(/);
});

test('MainActivity tears down delayed work, bridge, WebView and executor on destroy', async () => {
  const java = await mainSource();
  assert.match(java, /private\s+final\s+Runnable\s+startupPermissionRequest\s*=\s*this::requestStartupNotificationPermission/);
  assert.match(java, /postDelayed\(startupPermissionRequest,\s*700L\)/);

  const destroy = java.match(/protected void onDestroy\(\)[\s\S]*?(?=\n\s*@Override|\n\s*private |\n\s*public )/)?.[0] || '';
  assert.ok(destroy, 'onDestroy must be implemented');
  assert.match(destroy, /removeCallbacks\(startupPermissionRequest\)/);
  assert.match(destroy, /removeJavascriptInterface\("AndroidBridge"\)/);
  assert.match(destroy, /stopLoading\(\)/);
  assert.match(destroy, /destroy\(\)/);
  assert.match(destroy, /webView\s*=\s*null/);
  assert.match(destroy, /networkExecutor\.shutdownNow\(\)/);
  assert.match(destroy, /super\.onDestroy\(\)/);
});

test('startup notification permission is automatic only before the first answer while settings can retry manually', async () => {
  const java = await mainSource();
  const startup = java.match(/private void requestStartupNotificationPermission\(\) \{[\s\S]*?\n    \}/)?.[0] || '';
  assert.ok(startup, 'startup notification permission method must exist');
  assert.match(startup, /getSharedPreferences\(PREFS, Context\.MODE_PRIVATE\)/);
  assert.match(startup, /getBoolean\(NOTIFICATION_ASKED_KEY, false\)/);
  assert.match(startup, /NOTIFICATION_ASKED_KEY[\s\S]*?return;/);

  const bridgeRequest = java.match(/public void requestNotificationPermission\(\) \{[\s\S]*?\n        \}/)?.[0] || '';
  assert.ok(bridgeRequest, 'manual notification permission bridge must exist');
  assert.match(bridgeRequest, /notificationPermissionLauncher\.launch\(Manifest\.permission\.POST_NOTIFICATIONS\)/);
});
