import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const publicIndex = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const androidIndex = readFileSync(new URL('../android/app/src/main/assets/www/index.html', import.meta.url), 'utf8');

function topbarMarkup(html) {
  const match = html.match(/<header class="topbar">[\s\S]*?<\/header>/);
  assert.ok(match, 'topbar markup should exist');
  return match[0];
}

test('topbar uses the app logo instead of the BIST / portfolio title block', () => {
  for (const html of [publicIndex, androidIndex]) {
    const topbar = topbarMarkup(html);
    assert.match(topbar, /<div\b[^>]*class="topbar-brand"[^>]*>/);
    const logo = topbar.match(/<img\b[^>]*class="topbar-logo"[^>]*>/)?.[0] || '';
    assert.match(logo, /src="\.\/icon\.svg"/);
    assert.match(logo, /width="44"/);
    assert.match(logo, /height="44"/);
    assert.match(logo, /alt="Halka Arz Portföyüm"/);
    assert.doesNotMatch(topbar, /BIST\s*•\s*HALKA ARZ/);
    assert.doesNotMatch(topbar, /id="screenTitle"/);
  }
});

test('topbar markup stays identical between web source and packaged Android asset', () => {
  assert.equal(topbarMarkup(androidIndex), topbarMarkup(publicIndex));
});
