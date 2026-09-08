import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gradle = fs.readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../android/app/src/main/java/com/innative/halkaarz/MainActivity.java', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../android/app/src/main/assets/www/styles.css', import.meta.url), 'utf8');

test('release explicitly enables edge-to-edge with AndroidX helper and targets API 36', () => {
  assert.match(gradle, /compileSdk\s+36/);
  assert.match(gradle, /targetSdk\s+36/);
  assert.match(gradle, /androidx\.core:core:1\.17\.0/);
  assert.match(main, /WindowCompat\.enableEdgeToEdge\(getWindow\(\)\);/);
  assert.doesNotMatch(main, /WindowCompat\.setDecorFitsSystemWindows\(getWindow\(\), false\);/);
});

test('system bars and cutouts are converted to CSS safe insets', () => {
  assert.match(main, /WindowInsetsCompat\.Type\.systemBars\(\)\s*\|\s*WindowInsetsCompat\.Type\.displayCutout\(\)/);
  for (const side of ['top','bottom','left','right']) assert.match(main, new RegExp(`--android-safe-${side}`));
});

test('floating dock and FAB consume Android bottom safe inset', () => {
  assert.match(css, /\.bottom-nav\{[\s\S]*?--android-safe-bottom/);
  assert.match(css, /\.fab\{[\s\S]*?--android-safe-bottom/);
  assert.match(css, /--dock-control-gap:22px/);
});
