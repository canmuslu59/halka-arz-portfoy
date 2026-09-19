import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const wrapper = read('../scripts/apply-test-portfolio-app-navigation.mjs');
const overlay = read('../scripts/apply-news-preload-cache.mjs');

test('news preload overlay runs after article image enrichment', () => {
  assert.match(wrapper, /apply-test-news-article-images\.mjs[\s\S]*apply-news-preload-cache\.mjs/);
});

test('news cache hydrates immediately on app startup and refreshes in background', () => {
  assert.match(overlay, /FINANCE_NEWS_CACHE_KEY/);
  assert.match(overlay, /restoreFinanceNewsCache\(\)/);
  assert.match(overlay, /setTimeout\(\(\) => \{ loadPopularFinanceNews\(\); \}, 0\)/);
  assert.match(overlay, /FINANCE_NEWS_BACKGROUND_REFRESH_MS = 2 \* 60 \* 1000/);
  assert.match(overlay, /setInterval\([\s\S]*loadPopularFinanceNews\(\{ force:true \}\)/);
  assert.match(overlay, /visibilitychange/);
});

test('feed renders before slower source metadata enrichment completes', () => {
  assert.match(overlay, /const feedItems = financeNewsItemsOnly\(payload\?\.items\)/);
  assert.match(overlay, /popularFinanceNewsItems = feedItems[\s\S]*renderPopularFinanceNews\(\)[\s\S]*await enrichFinanceNewsItems/);
});

test('enriched news and image URLs persist for the next app launch', () => {
  assert.match(overlay, /localStorage\.setItem\(FINANCE_NEWS_CACHE_KEY/);
  assert.match(overlay, /persistFinanceNewsCache\(popularFinanceNewsItems\)/);
  assert.match(overlay, /preloadFinanceNewsImages\(popularFinanceNewsItems\)/);
});

test('top news images are proactively warmed and feature art is eager', () => {
  assert.match(overlay, /new Image\(\)/);
  assert.match(overlay, /image\.src = url/);
  assert.match(overlay, /loading="eager"/);
  assert.match(overlay, /fetchpriority="high"/);
});
