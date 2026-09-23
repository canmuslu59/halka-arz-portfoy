import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gradle = fs.readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../android/app/src/main/java/com/innative/halkaarz/MainActivity.java', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../android/app/src/main/assets/www/styles.css', import.meta.url), 'utf8');

test('release relies on Android 15 enforced edge-to-edge without deprecated AndroidX helper path', () => {
  assert.match(gradle, /compileSdk\s+36/);
  assert.match(gradle, /targetSdk\s+36/);
  assert.match(gradle, /androidx\.core:core:1\.17\.0/);
  assert.doesNotMatch(main, /WindowCompat\.enableEdgeToEdge/);
  assert.doesNotMatch(main, /setStatusBarColor|setNavigationBarColor/);
  assert.match(main, /Build\.VERSION\.SDK_INT >= 35/);
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
