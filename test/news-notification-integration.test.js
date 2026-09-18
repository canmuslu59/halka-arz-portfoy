import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const helper = readFileSync('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java', 'utf8');
const durable = readFileSync('cloudflare/durable-store.js', 'utf8');
const worker = readFileSync('cloudflare/worker.js', 'utf8');
const wrapper = readFileSync('scripts/apply-test-portfolio-app-navigation.mjs', 'utf8');

test('Android creates separate breaking-news and digest notification channels', () => {
  assert.match(helper, /CHANNEL_NEWS_BREAKING\s*=\s*"news_breaking_v1"/);
  assert.match(helper, /CHANNEL_NEWS_DIGEST\s*=\s*"news_digest_v1"/);
  assert.match(helper, /Son dakika haberleri/);
  assert.match(helper, /Haber özetleri/);
  assert.match(helper, /"news_breaking"\.equals\(kind\).*CHANNEL_NEWS_BREAKING/s);
  assert.match(helper, /"news_digest"\.equals\(kind\).*CHANNEL_NEWS_DIGEST/s);
});

test('Android deduplicates breaking news by news id and digests by slot/day', () => {
  assert.match(helper, /value\(data,\s*"news_id"/);
  assert.match(helper, /value\(data,\s*"digest_slot"/);
  assert.match(helper, /value\(data,\s*"digest_day"/);
  assert.match(helper, /news_breaking.*newsId/s);
  assert.match(helper, /news_digest.*digestSlot.*digestDay/s);
});

test('test APK routes both news push kinds directly to Haberler', () => {
  assert.match(wrapper, /apply-test-news-notification-route\.mjs/);
});

test('cloud news notifications remain feature-gated and use an explicit news feed URL', () => {
  assert.match(durable, /createNewsNotificationEngine/);
  assert.match(durable, /NEWS_NOTIFICATIONS_ENABLED/);
  assert.match(durable, /NEWS_FEED_URL/);
  assert.match(worker, /NEWS_NOTIFICATIONS_ENABLED/);
  assert.match(worker, /NEWS_FEED_URL/);
});

test('when news notifications are enabled Durable Object keeps polling outside market hours', () => {
  assert.match(durable, /newsNotificationsEnabled/);
  assert.match(durable, /ALARM_INTERVAL_MS/);
  assert.match(durable, /nextAlarmAt\([^)]*news/s);
});

test('enabling news wakes a previously distant Durable Object alarm on startup', () => {
  assert.match(durable, /constructor\(state, env = \{\}\)[\s\S]*newsNotificationsEnabled\(env\)[\s\S]*getAlarm\(\)[\s\S]*setAlarm\(nowMs \+ 1_000\)/);
});
