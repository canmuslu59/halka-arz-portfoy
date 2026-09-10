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
