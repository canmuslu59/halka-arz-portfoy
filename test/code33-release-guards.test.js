import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const activity = readFileSync('android/app/src/main/java/com/innative/halkaarz/MainActivity.java', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const provider = readFileSync('android/app/src/main/java/com/innative/halkaarz/WalletWidgetProvider.java', 'utf8');
const widgetInfo = readFileSync('android/app/src/main/res/xml/wallet_widget_info.xml', 'utf8');
const gradle = readFileSync('android/app/build.gradle', 'utf8');
const app = readFileSync('public/app.js', 'utf8');
const scheduler = readFileSync('android/app/src/main/java/com/innative/halkaarz/NewsTestScheduler.java', 'utf8');
const preview = readFileSync('android/app/src/main/java/com/innative/halkaarz/NewsTestPreviewWorker.java', 'utf8');

test('current production identity is correct', () => {
  assert.match(gradle, /applicationId 'com\.innative\.halkaarz'/);
  assert.match(gradle, /versionCode 34/);
  assert.match(gradle, /versionName '2\.5\.1'/);
});

test('edge-to-edge is backward compatible and avoids direct deprecated system-bar setters', () => {
  assert.match(activity, /EdgeToEdge\.enable\(/);
  assert.match(activity, /SystemBarStyle\.dark\(Color\.TRANSPARENT\)/);
  assert.doesNotMatch(activity, /WindowCompat\.enableEdgeToEdge/);
  assert.doesNotMatch(activity, /setStatusBarColor/);
  assert.doesNotMatch(activity, /setNavigationBarColor/);
  assert.doesNotMatch(activity, /Build\.VERSION\.SDK_INT >= 35/);
  assert.match(activity, /WindowInsetsCompat\.Type\.systemBars/);
});

test('wallet widget is declared, pin-requested once, and fed by exact rendered totals', () => {
  assert.match(manifest, /WalletWidgetProvider/);
  assert.match(manifest, /android\.appwidget\.action\.APPWIDGET_UPDATE/);
  assert.match(widgetInfo, /@layout\/wallet_widget/);
  assert.match(activity, /wallet_widget_prompted_v1/);
  assert.match(activity, /requestPinAppWidget/);
  assert.match(activity, /updateWalletWidget/);
  assert.match(app, /AndroidBridge\?\.updateWalletWidget/);
  for (const key of ['totalWealth','totalProfit','totalProfitPct','dailyProfit','dailyPct','invested','activeValue','salesProceeds']) {
    assert.match(app, new RegExp(key));
  }
  assert.match(provider, /wallet_widget_snapshot_v1/);
});

test('fake news preview cannot run in production', () => {
  assert.match(scheduler, /if \(previewEnabled\(\)\)/);
  assert.match(preview, /if \(!NewsTestScheduler\.previewEnabled\(\)\) return Result\.success\(\)/);
  assert.match(scheduler, /return BuildConfig\.DEBUG && appId\.endsWith\("\.graphtest"\)/);
});
