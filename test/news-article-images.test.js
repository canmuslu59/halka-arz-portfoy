import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const wrapper = read('../scripts/apply-test-portfolio-app-navigation.mjs');
const overlayUrl = new URL('../scripts/apply-test-news-article-images.mjs', import.meta.url);
const overlay = existsSync(overlayUrl) ? readFileSync(overlayUrl, 'utf8') : '';

test('article-image overlay runs after source metadata polish', () => {
  assert.match(wrapper, /apply-test-news-layout-polish-v2\.mjs[\s\S]*apply-test-news-article-images\.mjs/);
});

test('original article metadata extracts a secure image with ordered fallbacks', () => {
  assert.match(overlay, /og:image/);
  assert.match(overlay, /twitter:image/);
  assert.match(overlay, /application\/ld\+json/);
  assert.match(overlay, /imageUrl/);
  assert.match(overlay, /https:\/\//);
});

test('popular and latest news render real article images with category fallback', () => {
  assert.match(overlay, /news-feature-image/);
  assert.match(overlay, /news-latest-image/);
  assert.match(overlay, /onerror/);
  assert.match(overlay, /financeNewsArtClass/);
});

test('article images use cover sizing and do not disturb category chips', () => {
  assert.match(overlay, /object-fit:cover/);
  assert.match(overlay, /news-category-chip/);
  assert.match(overlay, /position:absolute/);
});
