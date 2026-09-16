import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const publicIndex = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const androidIndex = readFileSync(new URL('../android/app/src/main/assets/www/index.html', import.meta.url), 'utf8');
const publicStyles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const androidStyles = readFileSync(new URL('../android/app/src/main/assets/www/styles.css', import.meta.url), 'utf8');

function topbarMarkup(html) {
  const match = html.match(/<header class="topbar">[\s\S]*?<\/header>/);
  assert.ok(match, 'topbar markup should exist');
  return match[0];
}

test('topbar uses the app logo instead of the BIST / portfolio title block', () => {
  for (const html of [publicIndex, androidIndex]) {
    const topbar = topbarMarkup(html);
    assert.match(topbar, /<img\s+class="topbar-logo"\s+src="\.\/icon\.svg"\s+alt="Halka Arz Portföyüm"\s*\/>/);
    assert.doesNotMatch(topbar, /BIST\s*•\s*HALKA ARZ/);
    assert.doesNotMatch(topbar, /id="screenTitle"/);
  }
});

test('topbar logo styling is mirrored into Android assets', () => {
  assert.match(publicStyles, /\.topbar-logo\s*\{/);
  assert.equal(androidStyles, publicStyles);
});
