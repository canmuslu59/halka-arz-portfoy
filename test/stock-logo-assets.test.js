import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const wrapper = read('../scripts/apply-test-portfolio-app-navigation.mjs');
const overlayUrl = new URL('../scripts/apply-test-stock-logo-assets.mjs', import.meta.url);
const overlay = existsSync(overlayUrl) ? readFileSync(overlayUrl, 'utf8') : '';

test('stock-logo overlay is isolated and applied after news imagery', () => {
  assert.match(wrapper, /apply-test-news-article-images\.mjs[\s\S]*apply-test-stock-logo-assets\.mjs/);
});

test('stock logos are resolved from Fintables company-logo assets robustly', () => {
  assert.match(overlay, /DOMParser/);
  assert.match(overlay, /company-logos/i);
  assert.match(overlay, /storage\.fintables\.com/);
  assert.match(overlay, /decodeURIComponent/);
  assert.match(overlay, /srcset/);
});

test('logo rendering preserves letter fallback and avoids referrer hotlink issues', () => {
  assert.match(overlay, /holding-logo-fallback/);
  assert.match(overlay, /referrerPolicy/);
  assert.match(overlay, /no-referrer/);
  assert.match(overlay, /addEventListener\(['"]load['"]/);
  assert.match(overlay, /addEventListener\(['"]error['"]/);
});

test('logo resolver keeps a cache and validates secure storage URLs', () => {
  assert.match(overlay, /holdingLogoCache/);
  assert.match(overlay, /https:/);
  assert.match(overlay, /hostname/);
});
