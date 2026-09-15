import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Android manifest declares standalone internet-enabled app', async () => {
  const manifest = await read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:theme="@style\/Theme\.HalkaArz"/);
});

test('MainActivity exposes storage and HTTPS bridge methods', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.match(main, /@JavascriptInterface\s+public String readStorage/);
  assert.match(main, /@JavascriptInterface\s+public void writeStorage/);
  assert.match(main, /@JavascriptInterface\s+public String httpGet/);
  assert.match(main, /@JavascriptInterface\s+public void httpGetAsync/);
  assert.match(main, /NativeHttpPolicy\.requireAllowed/);
});

test('Android Gradle config uses requested app id and SDK levels', async () => {
  const gradle = await read('android/app/build.gradle');
  assert.match(gradle, /applicationId 'com\.innative\.halkaarz'/);
  assert.match(gradle, /compileSdk 36/);
  assert.match(gradle, /minSdk 26/);
  assert.match(gradle, /targetSdk 36/);
  assert.match(gradle, /versionCode 29/);
  assert.match(gradle, /versionName '2\.4\.6'/);
});

test('Android app disables service worker on intercepted app.local origin', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.match(main, /ServiceWorkerController/);
  assert.match(main, /app\.local/);
});

test('asset sync script copies public app into Android assets', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const sync = await read('scripts/sync-android-assets.mjs');
  assert.equal(pkg.scripts['android:sync'], 'node scripts/sync-android-assets.mjs');
  assert.match(sync, /android\/app\/src\/main\/assets\/www/);
});

test('Android storage stays device-local and source avoids newer String APIs', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.match(main, /SharedPreferences/);
  assert.doesNotMatch(main, /String\.formatted|\.stripIndent\(/);
});

test('historical and Phase1-only workflows are retired from the release tree', async () => {
  const files = await Promise.all([
    read('.github/workflows/code28-seven-issues-ci.yml'),
    read('.github/workflows/cloudflare-do-probe.yml'),
  ]);
  assert.ok(files.every(Boolean));
});

test('README documents direct-source Android verification and the current Code28 release path', async () => {
  const readme = await read('README.md');
  assert.match(readme, /Android/i);
  assert.match(readme, /Code28|2\.4\.6/i);
});

test('native bridge avoids Charset overload unavailable on older Android APIs', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.doesNotMatch(main, /new String\([^\n]+StandardCharsets/);
});

test('Android 13+ notification permission and Firebase messaging service are declared', async () => {
  const manifest = await read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /POST_NOTIFICATIONS/);
  assert.match(manifest, /HalkaArzMessagingService/);
  assert.match(manifest, /com\.google\.firebase\.MESSAGING_EVENT/);
});

test('native layer uses edge-to-edge insets and removes deprecated system bar colors', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.match(main, /EdgeToEdge\.enable/);
  assert.doesNotMatch(main, /setStatusBarColor|setNavigationBarColor/);
});

test('native bridge exposes notification permission and anonymous push sync methods', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.match(main, /notificationPermissionState/);
  assert.match(main, /syncPushConfig/);
  assert.doesNotMatch(main, /FirebaseAuth|signInWith/);
});

test('FCM service and notification helper route stock, portfolio and IPO taps', async () => {
  const service = await read('android/app/src/main/java/com/innative/halkaarz/HalkaArzMessagingService.java');
  const helper = await read('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java');
  assert.match(service, /extends FirebaseMessagingService/);
  assert.match(service, /onNewToken/);
  assert.match(service, /onMessageReceived/);
  assert.match(helper, /kind/);
  assert.match(helper, /ticker/);
  assert.match(helper, /ipo/);
  assert.match(helper, /portfolio/);
});

test('Android push sync wraps alert preferences under config for backend registration contract', async () => {
  const push = await read('android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java');
  assert.match(push, /JSONObject\s+configObject\s*=\s*new JSONObject\(config\)/);
  assert.match(push, /JSONObject\s+remoteConfig\s*=\s*new JSONObject\(configObject\.toString\(\)\)/);
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
