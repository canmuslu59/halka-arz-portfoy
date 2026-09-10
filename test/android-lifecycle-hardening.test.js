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
  assert.match(
    java,
    /protected void onDestroy\(\)[\s\S]*?removeCallbacks\(startupPermissionRequest\)[\s\S]*?removeJavascriptInterface\("AndroidBridge"\)[\s\S]*?stopLoading\(\)[\s\S]*?destroy\(\)[\s\S]*?webView\s*=\s*null[\s\S]*?networkExecutor\.shutdownNow\(\)[\s\S]*?super\.onDestroy\(\)/,
  );
});
