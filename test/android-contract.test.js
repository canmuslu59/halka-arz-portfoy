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
  assert.match(java, /@JavascriptInterface\s+public boolean writePortfolio\(/s);
  assert.doesNotMatch(java, /@JavascriptInterface\s+public String httpGet\(/s);
  assert.match(java, /@JavascriptInterface\s+public void httpGetAsync\(String urlText, String requestId\)/s);
  assert.doesNotMatch(java, /Executors\.newCachedThreadPool/);
  assert.match(java, /new ThreadPoolExecutor\(/);
  assert.match(java, /new ArrayBlockingQueue<>\(128\)/);
  assert.match(java, /new ThreadPoolExecutor\.AbortPolicy\(\)/);
  assert.match(java, /__nativeHttpResolve/);
  assert.match(java, /__nativeHttpReject/);
  assert.match(java, /"https"\.equalsIgnoreCase/);
  assert.match(java, /setConnectTimeout\(12000\)/);
  assert.match(java, /setReadTimeout\(12000\)/);
  assert.match(java, /https:\/\/app\.local\/index\.html/);
});

test('Android Gradle config uses requested app id and SDK levels', async () => {
  const gradle = await read('android/app/build.gradle');
  assert.match(gradle, /applicationId ['"]com\.innative\.halkaarz['"]/);
  assert.match(gradle, /minSdk 26/);
  assert.match(gradle, /targetSdk 36/);
  assert.match(gradle, /compileSdk 36/);
  assert.match(gradle, /versionCode 33/);
  assert.match(gradle, /versionName ['"]2\.5\.0['"]/);
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

test('historical and Phase1-only workflows are retired from the release tree', async () => {
  const workflows = await fs.readdir('.github/workflows');
  for (const obsolete of [
    'android-apk.yml',
    'android-code22.yml',
    'android-play-bootstrap.yml',
    'inspect-flatten-blockers.yml',
    'phase1-tdd.yml',
  ]) {
    assert.equal(workflows.includes(obsolete), false, `${obsolete} must not remain as an executable release path`);
  }
  assert.ok(workflows.includes('release-candidate.yml'), 'release-candidate.yml must remain as the release verification path');
});

test('README documents direct-source Android verification and the current Code28 release path', async () => {
  const readme = await read('README.md');
  assert.doesNotMatch(readme, /\.github\/workflows\/android-apk\.yml/);
  assert.doesNotMatch(readme, /Actions\s*[→>-]+\s*Build Android APK/i);
  assert.match(readme, /npm run android:sync/);
  assert.match(readme, /compileReleaseJavaWithJavac/);
  assert.doesNotMatch(readme, /compileDebugJavaWithJavac/);
  assert.doesNotMatch(readme, /Audit Current Clean Source/);
  assert.doesNotMatch(readme, /Phase1 TDD Contracts/);
  assert.match(readme, /Code28 release/);
  assert.match(readme, /versionName 2\.4\.6 \/ versionCode 28/);
});

test('native bridge avoids Charset overload unavailable on older Android APIs', async () => {
  const java = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.doesNotMatch(java, /toString\(StandardCharsets\.UTF_8\)/);
  assert.match(java, /toString\("UTF-8"\)/);
});

test('Android 13+ notification permission and Firebase messaging service are declared', async () => {
  const xml = await read('android/app/src/main/AndroidManifest.xml');
  const gradle = await read('android/app/build.gradle');
  assert.match(xml, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(xml, /PushMessagingService/);
  assert.match(xml, /com\.google\.firebase\.MESSAGING_EVENT/);
  assert.match(gradle, /firebase-messaging:24\.1\.1/);
});

test('native layer handles Android 15 edge-to-edge without deprecated system bar color APIs', async () => {
  const java = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  const theme = await read('android/app/src/main/res/values/themes.xml');
  assert.doesNotMatch(java, /setStatusBarColor/);
  assert.doesNotMatch(java, /setNavigationBarColor/);
  assert.doesNotMatch(theme, /statusBarColor/);
  assert.doesNotMatch(theme, /navigationBarColor/);
  assert.doesNotMatch(java, /WindowCompat\.enableEdgeToEdge/);
  assert.match(java, /Build\.VERSION\.SDK_INT >= 35/);
  assert.match(java, /WindowInsetsCompat\.Type\.systemBars/);
  assert.match(java, /--android-safe-top/);
  assert.match(java, /--android-safe-bottom/);
  assert.match(java, /--android-safe-left/);
  assert.match(java, /--android-safe-right/);
  assert.match(java, /WindowInsetsControllerCompat/);
});

test('native bridge exposes notification permission and anonymous push sync methods', async () => {
  const java = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  const sync = await read('android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java');
  assert.match(java, /@JavascriptInterface\s+public String getNotificationPermissionStatus\(/s);
  assert.match(java, /@JavascriptInterface\s+public void requestNotificationPermission\(/s);
  assert.match(java, /@JavascriptInterface\s+public void syncPushConfig\(/s);
  assert.match(sync, /UUID\.randomUUID/);
});

test('FCM service and notification helper route stock, portfolio and IPO taps', async () => {
  const service = await read('android/app/src/main/java/com/innative/halkaarz/PushMessagingService.java');
  const helper = await read('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java');
  assert.match(service, /extends FirebaseMessagingService/);
  assert.match(service, /onNewToken/);
  assert.match(service, /onMessageReceived/);
  assert.match(helper, /kind/);
  assert.match(helper, /ticker/);
  assert.match(helper, /ipo/);
  assert.match(helper, /portfolio/);
});

test('Android push sync wraps rollout-safe alert preferences under config for backend registration contract', async () => {
  const push = await read('android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java');
  assert.match(push, /JSONObject\s+configObject\s*=\s*new JSONObject\(config\)/);
  assert.match(push, /JSONObject\s+remoteConfig\s*=\s*new JSONObject\(configObject\.toString\(\)\)/);
  assert.match(push, /remoteConfig\.put\("trustedMarketEnabled",\s*configObject\.optBoolean\("enabled",\s*true\)\)/);
  assert.match(push, /remoteConfig\.put\("enabled",\s*false\)/);
  assert.match(push, /body\.put\("config",\s*remoteConfig\)/);
});

test('Android 36 build pins compatible AGP and AndroidX Core versions', async () => {
  const rootGradle = await read('android/build.gradle');
  const appGradle = await read('android/app/build.gradle');
  assert.match(rootGradle, /com\.android\.application['"] version ['"]8\.10\.1['"]/);
  assert.match(appGradle, /androidx\.core:core:1\.17\.0/);
  assert.match(appGradle, /com\.google\.firebase:firebase-messaging:24\.1\.1/);
  assert.doesNotMatch(appGradle, /androidx\.core:core:1\.19\.0/);
});
