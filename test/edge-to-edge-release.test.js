import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gradle = fs.readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../android/app/src/main/java/com/innative/halkaarz/MainActivity.java', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../android/app/src/main/assets/www/styles.css', import.meta.url), 'utf8');

test('release uses Activity EdgeToEdge API for backward-compatible edge-to-edge', () => {
  assert.match(gradle, /compileSdk\s+36/);
  assert.match(gradle, /targetSdk\s+36/);
  assert.match(gradle, /androidx\.activity:activity:1\.13\.0/);
  assert.match(main, /EdgeToEdge\.enable\(/);
  assert.match(main, /SystemBarStyle\.dark\(Color\.TRANSPARENT\)/);
  assert.doesNotMatch(main, /WindowCompat\.enableEdgeToEdge/);
  assert.doesNotMatch(main, /setStatusBarColor|setNavigationBarColor/);
  assert.doesNotMatch(main, /Build\.VERSION\.SDK_INT >= 35/);
});

test('system bars and cutouts are converted to CSS safe insets on every Android version', () => {
  assert.match(main, /WindowInsetsCompat\.Type\.systemBars\(\)\s*\|\s*WindowInsetsCompat\.Type\.displayCutout\(\)/);
  assert.match(main, /safeTopCssPx = Math\.round\(bars\.top \/ density\)/);
  assert.match(main, /safeBottomCssPx = Math\.round\(bars\.bottom \/ density\)/);
  assert.match(main, /safeLeftCssPx = Math\.round\(bars\.left \/ density\)/);
  assert.match(main, /safeRightCssPx = Math\.round\(bars\.right \/ density\)/);
  for (const side of ['top','bottom','left','right']) assert.match(main, new RegExp(`--android-safe-${side}`));
});

test('floating dock and FAB consume Android bottom safe inset', () => {
  assert.match(css, /\.bottom-nav\{[\s\S]*?--android-safe-bottom/);
  assert.match(css, /\.fab\{[\s\S]*?--android-safe-bottom/);
  assert.match(css, /--dock-control-gap:22px/);
});
