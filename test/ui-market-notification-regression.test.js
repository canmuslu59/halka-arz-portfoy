import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as notificationRules from '../public/core/notification-rules.js';
import * as ipoAnalytics from '../public/core/ipo-analytics.js';

const ROOT = path.resolve('.');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const { evaluateDailyAlerts } = notificationRules;

test('Android shell and bundled UI follow the Milestone Code42 release identity', () => {
  const gradle = read('android/app/build.gradle');
  const java = read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  const html = read('android/app/src/main/assets/www/index.html');
  assert.match(gradle, /versionCode 42/);
  assert.match(gradle, /versionName '2\.5\.8'/);
  assert.match(gradle, /targetSdk 36/);
  assert.match(gradle, /androidx\.core:core:1\.17\.0/);
  assert.match(gradle, /androidx\.activity:activity:1\.13\.0/);
  assert.match(gradle, /androidx\.fragment:fragment:1\.9\.0/);
  assert.match(java, /EdgeToEdge\.enable\(/);
  assert.match(java, /SystemBarStyle\.dark\(Color\.TRANSPARENT\)/);
  assert.doesNotMatch(java, /WindowCompat\.enableEdgeToEdge/);
  assert.doesNotMatch(java, /setStatusBarColor|setNavigationBarColor/);
  assert.doesNotMatch(java, /Build\.VERSION\.SDK_INT >= 35/);
  assert.match(java, /WindowInsetsCompat\.Type\.systemBars\(\) \| WindowInsetsCompat\.Type\.displayCutout\(\)/);
  assert.match(java, /safeTopCssPx = Math\.round\(bars\.top \/ density\)/);
  assert.match(java, /safeBottomCssPx = Math\.round\(bars\.bottom \/ density\)/);
  assert.match(html, /v2\.5\.8 • Build 42/);
});

test('BIST daily upper/lower limits use valid price-step rounding', () => {
  assert.equal(ipoAnalytics.ceilingPrice(100), 110);
  assert.equal(typeof ipoAnalytics.floorPrice, 'function');
  assert.equal(ipoAnalytics.floorPrice(100), 90);
  assert.equal(ipoAnalytics.ceilingPrice(23.17), 25.48);
  assert.equal(ipoAnalytics.floorPrice(23.17), 20.86);
});

test('1 percent threshold emits the newly reached portfolio level without ordinary stock alerts', () => {
  const first = evaluateDailyAlerts({
    day:'2026-09-08', threshold:1, enabled:true,
    holdings:[{ticker:'AAA',dailyPct:1.08,currentPrice:101.08,previousClose:100,dailySessionActive:true}],
    portfolioPct:1.04,
  });
  assert.equal(first.events.some(e => e.kind === 'stock'), false);
  assert.deepEqual(first.events.filter(e => e.kind === 'portfolio').map(e => e.level), [1]);
  const again = evaluateDailyAlerts({
    day:'2026-09-08', threshold:1, enabled:true,
    holdings:[{ticker:'AAA',dailyPct:1.4,currentPrice:101.4,previousClose:100,dailySessionActive:true}],
    portfolioPct:1.2, previousState:first.state,
  });
  assert.equal(again.events.some(e => e.kind === 'stock' || e.kind === 'portfolio'), false);
});

test('tavan and taban are each notified only once per ticker per Istanbul day', () => {
  const first = evaluateDailyAlerts({
    day:'2026-09-08', threshold:3, enabled:true,
    holdings:[{ticker:'TEST',dailyPct:10,currentPrice:110,previousClose:100,dailySessionActive:true}],
    portfolioPct:0,
  });
  assert.equal(first.events.filter(e => e.kind === 'ceiling').length, 1);
  const duplicate = evaluateDailyAlerts({
    day:'2026-09-08', threshold:3, enabled:true,
    holdings:[{ticker:'TEST',dailyPct:10,currentPrice:110,previousClose:100,dailySessionActive:true}],
    portfolioPct:0, previousState:first.state,
  });
  assert.equal(duplicate.events.filter(e => e.kind === 'ceiling').length, 0);
  const floor = evaluateDailyAlerts({
    day:'2026-09-08', threshold:3, enabled:true,
    holdings:[{ticker:'TEST',dailyPct:-10,currentPrice:90,previousClose:100,dailySessionActive:true}],
    portfolioPct:0, previousState:duplicate.state,
  });
  assert.equal(floor.events.filter(e => e.kind === 'floor').length, 1);
  const nextDay = evaluateDailyAlerts({
    day:'2026-09-09', threshold:3, enabled:true,
    holdings:[{ticker:'TEST',dailyPct:10,currentPrice:110,previousClose:100,dailySessionActive:true}],
    portfolioPct:0, previousState:floor.state,
  });
  assert.equal(nextDay.events.filter(e => e.kind === 'ceiling').length, 1);
});

test('closed/non-current sessions do not create false tavan or taban alerts', () => {
  const result = evaluateDailyAlerts({
    day:'2026-09-12', threshold:1, enabled:true,
    holdings:[{ticker:'AAA',dailyPct:0,currentPrice:110,previousClose:100,dailySessionActive:false}],
    portfolioPct:0,
  });
  assert.equal(result.events.some(e => e.kind === 'ceiling' || e.kind === 'floor'), false);
});

test('native fallback evaluates only fresh quotes, waits for permission, and routes limit taps to the stock', () => {
  const app = read('android/app/src/main/assets/www/app.js');
  const java = read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.match(app, /evaluateLocalAlerts\(fresh\)/);
  assert.match(app, /localAlertStateV1/);
  assert.match(app, /showLocalNotification/);
  const start = app.indexOf('function evaluateLocalAlerts');
  const end = app.indexOf('function pushPayload', start);
  const body = app.slice(start, end);
  assert.ok(body.indexOf('readNativeNotificationPermission') < body.indexOf('safeSetLocal(LOCAL_ALERT_STATE_KEY'));
  assert.match(app, /\['stock','ceiling','floor'\]\.includes\(kind\)/);
  assert.match(app, /__notificationPermissionChanged\s*=\s*\(\)\s*=>\s*\{[^}]*renderSettings\(\);[^}]*loadPortfolio\(\{\s*quiet:true,\s*force:true\s*\}\)/s);
  assert.match(java, /public boolean showLocalNotification\(String json\)/);
  assert.match(java, /return NotificationHelper\.show/);
});

test('market notification channel is new and high importance for update installs', () => {
  const helper = read('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java');
  assert.match(helper, /CHANNEL_MARKET\s*=\s*"market_moves_v2"/);
  assert.match(helper, /NotificationManager\.IMPORTANCE_HIGH/);
  assert.match(helper, /NotificationCompat\.PRIORITY_HIGH/);
});

test('floating dock has scroll-aware fade and boundary recovery behavior', () => {
  const app = read('android/app/src/main/assets/www/app.js');
  const css = read('android/app/src/main/assets/www/styles.css');
  assert.match(app, /function updateDockVisibility/);
  assert.match(app, /const atTop = scrollY <= 8/);
  assert.match(app, /const atBottom = maxY - scrollY <= 8/);
  assert.match(app, /movingDown/);
  assert.match(app, /movingUp/);
  assert.match(app, /dock-hidden/);
  assert.match(css, /\.bottom-nav\.dock-hidden/);
  assert.match(css, /transition:opacity \.30s ease,transform \.30s/);
  assert.match(css, /pointer-events:none/);
});

