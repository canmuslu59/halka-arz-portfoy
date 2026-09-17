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

test('BIST logos use the direct ticker-addressable jsDelivr asset set', () => {
  assert.match(overlay, /cdn\.jsdelivr\.net\/gh\/ahmeterenodaci\/Istanbul-Stock-Exchange--BIST--including-symbols-and-logos\/logos\//);
  assert.match(overlay, /encodeURIComponent\(symbol\)/);
  assert.match(overlay, /\.png/);
  assert.doesNotMatch(overlay, /fintables\.com\/sirketler/);
  assert.doesNotMatch(overlay, /httpGetText\(/);
});

test('logo rendering preserves letter fallback and avoids referrer hotlink issues', () => {
  assert.match(overlay, /holding-logo-fallback/);
  assert.match(overlay, /referrerPolicy/);
  assert.match(overlay, /no-referrer/);
  assert.match(overlay, /addEventListener\(['"]load['"]/);
  assert.match(overlay, /addEventListener\(['"]error['"]/);
});

test('ticker normalization prevents malformed logo paths', () => {
  assert.match(overlay, /toLocaleUpperCase\(['"]tr-TR['"]\)/);
  assert.match(overlay, /\^\[A-Z0-9\]\+\$/);
});
