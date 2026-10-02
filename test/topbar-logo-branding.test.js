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
  for (const [html, logoSrc] of [[publicIndex, /src="\.\/icon\.svg"/], [androidIndex, /src="\.\/launcher-icon\.webp"/]]) {
    const topbar = topbarMarkup(html);
    assert.match(topbar, /<div\b[^>]*class="topbar-brand"[^>]*>/);
    const logo = topbar.match(/<img\b[^>]*class="topbar-logo"[^>]*>/)?.[0] || '';
    assert.match(logo, logoSrc);
    assert.match(logo, /width="44"/);
    assert.match(logo, /height="44"/);
    assert.match(logo, /alt="Hisse Portföyüm"/);
    assert.doesNotMatch(topbar, /BIST\s*•\s*HALKA ARZ/);
    assert.doesNotMatch(topbar, /id="screenTitle"/);
  }
});

// Play paketi, onaylı share-ui overlay'inin eklediği launcher-icon.webp logosunu kullanır (Code37'den beri).
test('packaged Android topbar differs from the web source only by the bundled launcher logo', () => {
  assert.equal(topbarMarkup(androidIndex).replace('src="./launcher-icon.webp"', 'src="./icon.svg"'), topbarMarkup(publicIndex));
});
