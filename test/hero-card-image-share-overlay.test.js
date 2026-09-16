import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const overlay = readFileSync(new URL('../scripts/apply-test-share-ui.mjs', import.meta.url), 'utf8');

test('test overlay shares the hero card as an image instead of portfolio text', () => {
  assert.match(overlay, /portfolioHeroCard/);
  assert.match(overlay, /getBoundingClientRect\(\)/);
  assert.match(overlay, /shareCardImage/);
  assert.match(overlay, /Bitmap\.createBitmap/);
  assert.match(overlay, /FileProvider/);
  assert.match(overlay, /portfolio-card\.png/);
  assert.doesNotMatch(overlay, /shareText\(/);
});

test('test overlay makes the hero card fill the opening viewport without exposing performance card', () => {
  assert.match(overlay, /hero-home-card/);
  assert.match(overlay, /100dvh/);
  assert.match(overlay, /android-safe-top/);
  assert.match(overlay, /share-capture/);
});

test('image capture hides floating navigation controls so only the hero card is shared', () => {
  assert.match(overlay, /share-capture-active/);
  assert.match(overlay, /\.bottom-nav/);
  assert.match(overlay, /\.fab/);
  assert.match(overlay, /classList\.add\('share-capture-active'\)/);
  assert.match(overlay, /classList\.remove\('share-capture-active'\)/);
});

test('image sharing uses a cache-only FileProvider path and does not request storage permission', () => {
  assert.match(overlay, /share_file_paths\.xml/);
  assert.match(overlay, /cache-path/);
  assert.match(overlay, /FLAG_GRANT_READ_URI_PERMISSION/);
  assert.doesNotMatch(overlay, /WRITE_EXTERNAL_STORAGE/);
  assert.doesNotMatch(overlay, /READ_EXTERNAL_STORAGE/);
});
