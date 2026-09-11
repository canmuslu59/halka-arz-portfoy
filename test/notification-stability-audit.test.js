import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { evaluateRegistrationAlerts } from '../backend/alert-engine.js';

const read = path => fs.readFile(path, 'utf8');

function methodBody(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing ${signature}`);
  const end = nextSignature ? source.indexOf(nextSignature, start + signature.length) : source.length;
  assert.notEqual(end, -1, `missing ${nextSignature}`);
  return source.slice(start, end);
}

test('startup push sync never replaces persisted holdings before local portfolio hydration', async () => {
  const app = await read('public/app.js');
  const sync = methodBody(app, 'function syncPushConfiguration()', 'window.__notificationPermissionChanged');
  assert.match(sync, /if\s*\(!state\.portfolio\)\s*return;/,
    'native push config must not be overwritten with an empty holdings array before portfolio hydration');

  const load = methodBody(app, 'async function loadPortfolio', 'async function refreshBackgroundHistory');
  const cached = load.indexOf('state.portfolio = cached;');
  const syncCached = load.indexOf('syncPushConfiguration();', cached);
  const fresh = load.indexOf('await service.getPortfolio({ refresh:true', cached);
  assert.ok(cached >= 0 && syncCached > cached && fresh > syncCached,
    'cached local holdings must be synced to native background alerts before the network refresh starts');
});

test('native notification delivery has one persisted cross-producer once-per-event guard', async () => {
  const helper = await read('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java');
  assert.match(helper, /DELIVERY_STATE_KEY/);
  assert.match(helper, /Europe\/Istanbul/);
  assert.match(helper, /synchronized\s*\(DELIVERY_LOCK\)/);
  assert.match(helper, /if\s*\(delivered\.contains\(deliveryKey\)\)\s*return true;/,
    'an already delivered event should be treated as a successful no-op so producer state can converge');
  const notify = helper.indexOf('manager.notify(');
  const persist = helper.indexOf('putString(DELIVERY_STATE_KEY', notify);
  assert.ok(notify >= 0 && persist > notify,
    'delivery guard must advance only after NotificationManager accepted the notification');
});

test('cross-producer portfolio dedupe uses semantic threshold level instead of localized body text', async () => {
  const rules = await read('public/core/notification-rules.js');
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  const helper = await read('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java');

  const payload = methodBody(rules, 'export function notificationPayloadForEvent', null);
  assert.match(payload, /level\s*:/, 'foreground portfolio payload must carry the numeric threshold level');

  const nativePortfolio = methodBody(worker, 'private static boolean showPortfolioNotification', 'private static void checkIpoCalendar');
  assert.match(nativePortfolio, /data\.put\("level"/, 'background portfolio payload must carry the numeric threshold level');

  assert.match(helper, /"portfolio"\.equals\(kind\)[\s\S]*value\(data,\s*"level"/,
    'final delivery identity for portfolio alerts must use level, not display body text');
});

test('foreground Android bridge preserves portfolio threshold level before final native dedupe', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  const bridge = methodBody(main, 'public boolean showLocalNotification(String json)', 'public void setSystemTheme(String theme)');
  assert.match(bridge, /parsed\.optString\("level",\s*""\)/,
    'foreground payload level must be read from JavaScript JSON');
  assert.match(bridge, /data\.put\("level",/,
    'foreground payload level must reach NotificationHelper so WorkManager and foreground share one semantic identity');
});

test('cross-producer IPO dedupe ignores producer-specific wording and keys by ticker within the Istanbul day', async () => {
  const helper = await read('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java');
  assert.match(helper, /"ipo"\.equals\(kind\)[\s\S]*deliveryKey\s*=\s*kind\s*\+\s*"\|"\s*\+\s*ticker/,
    'native worker and future FCM producer use different IPO wording, so the final day-level guard must dedupe IPO delivery by ticker');
});

test('native IPO notifications seed the first complete snapshot instead of replaying every existing IPO', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  const start = worker.indexOf('private static void checkIpoCalendar');
  const end = worker.indexOf('private static List<IpoCalendarParser.Entry> mergeIpoEntries', start);
  const body = worker.slice(start, end);
  assert.match(body, /prefs\.contains\(IPO_STATE_KEY\)/);
  assert.match(body, /if\s*\(![^)]*contains[^)]*\)[\s\S]*putString\(IPO_STATE_KEY[\s\S]*return;/,
    'first complete calendar read must establish a baseline without user-visible replay notifications');
});

test('backend never labels a partial quote basket as total portfolio movement while valid stock limits still work', () => {
  const registration = {
    enabled:true,
    threshold:3,
    holdings:[{ticker:'AAA',lots:10},{ticker:'BBB',lots:5}],
    alertState:null,
  };
  const quotes = new Map([
    ['AAA',{ticker:'AAA',current:110,previousClose:100,latestMarketDate:'2026-09-11'}],
    ['BBB',{ticker:'BBB',current:200,previousClose:200,latestMarketDate:'2026-09-10'}],
  ]);
  const result = evaluateRegistrationAlerts({ registration, quotes, day:'2026-09-11' });
  assert.equal(result.portfolioPct, null,
    'incomplete current-session coverage must be represented as unavailable, not a partial percentage');
  assert.deepEqual(result.events.map(event => event.kind), ['ceiling'],
    'a valid per-stock limit event remains deliverable but no portfolio threshold may be emitted');
});

test('backend preserves an explicit BIST reference price for limit evaluation', () => {
  const registration = {
    enabled:true,
    threshold:3,
    holdings:[{ticker:'AAA',lots:10}],
    alertState:null,
  };
  const quotes = new Map([
    ['AAA',{ticker:'AAA',current:100,previousClose:90,referencePrice:95,latestMarketDate:'2026-09-11'}],
  ]);
  const result = evaluateRegistrationAlerts({ registration, quotes, day:'2026-09-11' });
  assert.equal(result.events.some(event => event.kind === 'ceiling'), false,
    'backend must not drop a supplied exchange reference price and fall back to previousClose');
});

test('native worker requires complete current-session quote coverage before portfolio threshold delivery', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  assert.match(worker, /int\s+expectedQuoteCount\s*=\s*0/);
  assert.match(worker, /expectedQuoteCount\s*\+=\s*1|expectedQuoteCount\+\+/,
    'each configured positive-lot holding must count toward portfolio coverage');
  assert.match(worker, /validTodayCount\s*==\s*expectedQuoteCount/,
    'portfolio threshold calculation must require every configured holding to have a current-session quote');
});

test('foreground portfolio hydration preserves quote session extrema for notification rules', async () => {
  const service = await read('public/core/portfolio-service.js');
  assert.match(service, /sessionHigh\s*:\s*nullableFiniteNumber\(quote\.sessionHigh\)/,
    'foreground hydrated holdings must retain the current-session high from the quote parser');
  assert.match(service, /sessionLow\s*:\s*nullableFiniteNumber\(quote\.sessionLow\)/,
    'foreground hydrated holdings must retain the current-session low from the quote parser');
});

test('foreground portfolio hydration preserves an explicit BIST reference price', async () => {
  const service = await read('public/core/portfolio-service.js');
  assert.match(service, /referencePrice\s*:\s*nullableFiniteNumber\(quote\.referencePrice\)/,
    'a verified reference price supplied by a quote source must survive portfolio hydration');
});

test('native worker models and prefers an explicit BIST reference price for limit math', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  assert.match(worker, /final\s+double\s+referencePrice/,
    'native Quote must be able to carry a verified exchange reference price');
  assert.match(worker, /limitBase\s*=\s*Double\.isFinite\(quote\.referencePrice\)[\s\S]*quote\.previousClose/,
    'native limit math must prefer referencePrice and fall back to previousClose');
  assert.match(worker, /ceilingPrice\(limitBase\)/);
  assert.match(worker, /floorPrice\(limitBase\)/);
});

test('native config normalization uses the same half-point threshold contract as the UI', async () => {
  const sync = await read('android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java');
  const save = methodBody(sync, 'static void saveConfig(Context context, String json)', 'static void saveToken(Context context, String token)');
  assert.match(save, /Math\.round\([^\n]*\*\s*2\.0\)\s*\/\s*2\.0/,
    'native config must round thresholds to the same 0.5 steps as normalizeAlertSettings');
});
