import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const worker = read('../android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
const helper = read('../android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java');
const pushSync = read('../android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java');
const rules = read('../android/app/src/main/java/com/innative/halkaarz/PortfolioAlertRules.java');
const backend = read('../backend/service.js');

// This file protects the market-alert behavior already proven in the live Code29 line.
// News notification additions may extend NotificationHelper, but must not rewrite these contracts.

test('market quote remains Yahoo while trusted limit reference falls back Foreks then OYAK', () => {
  assert.match(worker, /query1\.finance\.yahoo\.com\/v8\/finance\/chart\//);
  const foreks = worker.indexOf('https://webservice.foreks.com/foreks-web-widget/singlepage/');
  const oyak = worker.indexOf('https://www.oyakyatirim.com.tr/hisse-detay/');
  assert.ok(foreks >= 0, 'Foreks trusted reference must exist');
  assert.ok(oyak > foreks, 'OYAK must remain the second trusted reference after Foreks');
  assert.match(worker, /fetchTrustedMarketReference\(ticker\)/);
  assert.match(worker, /reference\.previousClose/);
  assert.match(worker, /reference\.ceilingPrice/);
  assert.match(worker, /reference\.floorPrice/);
});

test('ceiling and floor delivery remains once-per-day stateful using verified reference levels', () => {
  assert.match(worker, /tickerLimits\.optBoolean\("ceiling", false\)/);
  assert.match(worker, /tickerLimits\.optBoolean\("floor", false\)/);
  assert.match(worker, /tickerLimits\.put\("ceiling", true\)/);
  assert.match(worker, /tickerLimits\.put\("floor", true\)/);
  assert.match(worker, /state\.put\("limits", limits\)/);
  assert.match(worker, /quote\.current >= ceiling - ceilingTolerance/);
  assert.match(worker, /quote\.current <= floor \+ floorTolerance/);
});

test('portfolio rise and fall thresholds keep the live Code29 rule engine', () => {
  assert.match(worker, /PortfolioAlertRules\.sampledPercentages/);
  assert.match(worker, /PortfolioAlertRules\.levels/);
  assert.match(worker, /boolean falling = level < 0/);
  assert.match(worker, /"portfolio_fall"/);
  assert.match(rules, /static List<Double> levels/);
});

test('push config keeps verified market protocol and live backend compatibility contract', () => {
  assert.match(pushSync, /marketReferenceProtocol", 2/);
  assert.match(pushSync, /trustedMarketEnabled/);
  assert.match(pushSync, /remoteConfig\.put\("enabled", false\)/);
  assert.match(backend, /createPushService/);
});

test('legacy market notification identity stays byte-for-behavior compatible while news may use its own identity', () => {
  assert.match(helper, /String eventKey =|String eventKey;/);
  assert.match(helper, /kind \+ ":" \+ ticker \+ ":" \+ body\.replace\(',', '\.'\)/);

  // Live Code29 market notifications derive Android notification/PendingIntent identity from
  // the raw body, independently of the de-dupe key. News kinds may use their dedicated key.
  assert.match(
    helper,
    /int requestCode = \("news_breaking"\.equals\(kind\) \|\| "news_digest"\.equals\(kind\)\)\s*\? eventKey\.hashCode\(\)\s*:\s*\(kind \+ ":" \+ ticker \+ ":" \+ body\)\.hashCode\(\)/,
  );

  assert.match(helper, /CHANNEL_CEILING = "market_ceiling_coin_v1"/);
  assert.match(helper, /CHANNEL_FLOOR = "market_floor_v1"/);
  assert.match(helper, /CHANNEL_RISE = "market_rise_v1"/);
  assert.match(helper, /CHANNEL_FALL = "portfolio_fall_v1"/);
});
