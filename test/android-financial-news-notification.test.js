import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const patch = read('../scripts/apply-test-financial-news-native.mjs');
const baseGradle = read('../android/app/build.gradle');
const baseScheduler = read('../android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java');

test('financial breaking native integration stays test-only', () => {
  assert.doesNotMatch(baseGradle, /NEWS_BACKEND_URL/);
  assert.doesNotMatch(baseScheduler, /newsEnabled/);
  assert.ok(patch.includes("buildConfigField 'String', 'NEWS_BACKEND_URL'"));
  assert.ok(patch.includes('halka-arz-portfoy-news-test.grass-airboat.workers.dev'));
});

test('breaking poll requests only breaking items and locally deduplicates ids', () => {
  assert.ok(patch.includes('/v1/news?breaking=1&limit=20'));
  assert.ok(patch.includes('NEWS_BREAKING_STATE_KEY = "financial_breaking_seen_v1"'));
  assert.ok(patch.includes('!item.optBoolean("breaking", false)'));
  assert.ok(patch.includes('seen.contains(id)'));
  assert.ok(patch.includes('data.put("kind", "financial_breaking")'));
  assert.ok(patch.includes('CHANNEL_FINANCIAL_NEWS = "financial_breaking_v1"'));
});

test('test news polling remains scheduled even if portfolio and ipo alerts are disabled', () => {
  assert.ok(patch.includes('boolean newsEnabled = BuildConfig.NEWS_BACKEND_URL != null && !BuildConfig.NEWS_BACKEND_URL.trim().isEmpty()'));
  assert.ok(patch.includes('sync(app, newsEnabled || config.optBoolean("enabled", true) || config.optBoolean("ipoEnabled", true))'));
  assert.ok(patch.includes('BackgroundAlertScheduler.sync(context, newsEnabled || safe.optBoolean("enabled", true) || safe.optBoolean("ipoEnabled", true))'));
});

test('existing portfolio notification routing is patched additively rather than replaced', () => {
  assert.ok(patch.includes('else if ("financial_breaking".equals(kind)) channel = CHANNEL_FINANCIAL_NEWS'));
  assert.ok(patch.includes('else if ("ceiling".equals(kind)) channel = CHANNEL_CEILING'));
  assert.ok(patch.includes('private static final String CHANNEL_IPO = "new_ipos"'));
});
