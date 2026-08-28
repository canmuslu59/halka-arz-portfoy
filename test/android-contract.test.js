import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) { return fs.readFile(path, 'utf8'); }

test('Android manifest declares standalone internet-enabled app', async () => {
  const xml = await read('android/app/src/main/AndroidManifest.xml');
  assert.match(xml, /android\.permission\.INTERNET/);
  assert.match(xml, /usesCleartextTraffic="false"/);
  assert.match(xml, /com\.innative\.halkaarz/);
});

test('MainActivity exposes storage and HTTPS bridge methods', async () => {
  const java = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.match(java, /@JavascriptInterface\s+public String readPortfolio\(/s);
  assert.match(java, /@JavascriptInterface\s+public void writePortfolio\(/s);
  assert.match(java, /@JavascriptInterface\s+public String httpGet\(/s);
  assert.match(java, /"https"\.equalsIgnoreCase/);
  assert.match(java, /setConnectTimeout\(12000\)/);
  assert.match(java, /setReadTimeout\(12000\)/);
  assert.match(java, /https:\/\/app\.local\/index\.html/);
});

test('Android Gradle config uses requested app id and SDK levels', async () => {
  const gradle = await read('android/app/build.gradle');
  assert.match(gradle, /applicationId ['"]com\.innative\.halkaarz['"]/);
  assert.match(gradle, /minSdk 26/);
  assert.match(gradle, /targetSdk 35/);
  assert.match(gradle, /compileSdk 35/);
});

test('Android app disables service worker on intercepted app.local origin', async () => {
  const app = await read('public/app.js');
  assert.match(app, /location\.hostname !== ['\"]app\.local['\"]/);
});

test('asset sync script copies public app into Android assets', async () => {
  const script = await read('scripts/sync-android-assets.mjs');
  assert.match(script, /public/);
  assert.match(script, /android\/app\/src\/main\/assets\/www/);
});


test('Android storage stays device-local and source avoids newer String APIs', async () => {
  const xml = await read('android/app/src/main/AndroidManifest.xml');
  const java = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.match(xml, /android:allowBackup="false"/);
  assert.doesNotMatch(xml, /android:fullBackupContent="true"/);
  assert.doesNotMatch(java, /\.isBlank\(/);
});

test('GitHub Actions workflow builds and uploads the debug APK', async () => {
  const yaml = await read('.github/workflows/android-apk.yml');
  assert.match(yaml, /actions\/setup-java@v4/);
  assert.match(yaml, /android-actions\/setup-android@v3/);
  assert.match(yaml, /platforms;android-35/);
  assert.match(yaml, /build-tools;35\.0\.0/);
  assert.match(yaml, /assembleDebug/);
  assert.match(yaml, /actions\/upload-artifact@v4/);
});


test('native bridge avoids Charset overload unavailable on older Android APIs', async () => {
  const java = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.doesNotMatch(java, /toString\(StandardCharsets\.UTF_8\)/);
  assert.match(java, /toString\("UTF-8"\)/);
});

test('Android bridge performs HTTPS asynchronously on a bounded executor', async () => {
  const java = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.match(java, /ExecutorService/);
  assert.match(java, /newFixedThreadPool\([234]\)/);
  assert.match(java, /@JavascriptInterface\s+public void httpGetAsync\(/s);
  assert.match(java, /__nativeHttpResolve/);
  assert.match(java, /__nativeHttpReject/);
  assert.match(java, /evaluateJavascript/);
});

test('Android root back requires a second press within two seconds', async () => {
  const java = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.match(java, /lastBackPress/);
  assert.match(java, /2000/);
  assert.match(java, /__showBackExitHint/);
  assert.match(java, /webView\.canGoBack\(\)/);
});

test('Android debug APK uses a repository-stable signing key for future in-place updates', async () => {
  const gradle = await read('android/app/build.gradle');
  await fs.access('android/app/halkaarz-debug.keystore');
  assert.match(gradle, /signingConfigs\s*\{/);
  assert.match(gradle, /halkaarz-debug\.keystore/);
  assert.match(gradle, /keyAlias ['"]halkaarz['"]/);
  assert.match(gradle, /signingConfig signingConfigs\.stableDebug/);
  assert.match(gradle, /versionCode 3/);
  assert.match(gradle, /versionName ['"]2\.0\.1['"]/);
});
