import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const wrapper = read('../scripts/apply-test-portfolio-app-navigation.mjs');
const polishUrl = new URL('../scripts/apply-test-news-layout-polish-v2.mjs', import.meta.url);
const polish = existsSync(polishUrl) ? readFileSync(polishUrl, 'utf8') : '';

test('second-pass news polish is isolated and runs after news fallback', () => {
  assert.match(wrapper, /apply-test-popular-finance-news-fallback\.mjs[\s\S]*apply-test-news-layout-polish-v2\.mjs/);
});

test('finance news content can scroll fully above the floating dock', () => {
  assert.match(polish, /\.finance-news-view\{[^}]*padding-bottom:calc\([^}]*--dock-height[^}]*--android-safe-bottom/s);
  assert.match(polish, /scroll-padding-bottom/);
});

test('center wallet has a visible label and is blue only when active', () => {
  assert.match(polish, /<b>Cüzdan<\/b>/);
  assert.match(polish, /\.wallet-center-tab:not\(\.active\)/);
  assert.match(polish, /\.wallet-center-tab\.active/);
  assert.match(polish, /background:transparent|background:rgba\(/);
  assert.match(polish, /wallet-center-tab\.active[^}]*linear-gradient/s);
});

test('popular cards are shorter and use a compact two-line headline body', () => {
  assert.match(polish, /\.news-feature-card\{[^}]*clamp\(/s);
  assert.match(polish, /\.news-feature-body\{[^}]*padding:/s);
  assert.match(polish, /\.news-feature-title\{[^}]*-webkit-line-clamp:2/s);
  assert.match(polish, /\.news-feature-title\{[^}]*min-height:0/s);
});

test('latest news thumbnails are reduced for a denser list', () => {
  assert.match(polish, /\.news-latest-item\{[^}]*grid-template-columns:clamp\(58px,17vw,72px\)/s);
  assert.match(polish, /\.news-latest-item\{[^}]*padding:8px 0/s);
});

test('generic navigation or market labels are never shown as news headlines', () => {
  assert.match(polish, /function isGenericFinanceNewsTitle\(/);
  for (const generic of ['Hisse Senetleri', 'Borsa Kapanış', 'Cumhuriyet Altını', 'Ziynet Altını']) {
    assert.match(polish, new RegExp(generic));
  }
  assert.match(polish, /filter\(Boolean\)/);
});

test('Bloomberg HT visible items use original article metadata for title and publication time', () => {
  assert.match(polish, /function extractFinanceArticleMetadata\(/);
  assert.match(polish, /og:title/);
  assert.match(polish, /article:published_time/);
  assert.match(polish, /datePublished/);
  assert.match(polish, /time\[datetime\]/);
  assert.match(polish, /async function enrichFinanceNewsItems\(/);
  assert.match(polish, /httpGetText\(item\.url\)/);
  assert.match(polish, /Bloomberg HT/);
  assert.match(polish, /publishedAt:\s*metadata\.publishedAt\s*\|\|\s*null/);
});

test('source metadata fallback never fabricates publication time from fetch time', () => {
  assert.doesNotMatch(polish, /publishedAt:\s*new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(polish, /publishedAt:\s*Date\.now\(\)/);
  assert.match(polish, /publishedAt:\s*null/);
});

test('article metadata hosts needed by visible finance sources are allowlisted by the polish overlay', () => {
  assert.match(polish, /bloomberght\.com/);
  assert.match(polish, /www\.bloomberght\.com/);
  assert.match(polish, /NativeHttpPolicy/);
});
