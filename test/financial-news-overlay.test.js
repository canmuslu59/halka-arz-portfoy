import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const overlay = read('../scripts/apply-test-financial-news.mjs');
const wrapper = read('../scripts/apply-test-portfolio-app-navigation.mjs');

test('final test overlay replaces visible Piyasalar copy with Haberler', () => {
  assert.match(wrapper, /apply-test-financial-news\.mjs/);
  assert.match(overlay, />Haberler<\/b>/);
  assert.match(overlay, /markets:\s*\{\s*title:'Haberler'\s*\}/);
  assert.match(overlay, /<h2>Haberler<\/h2>/);
  assert.doesNotMatch(overlay, />Piyasalar<\/b>/);
});

test('news view has only the approved finance filters', () => {
  for (const label of ['Tümü','Borsa','Şirketler','Döviz','Altın','Ekonomi','Halka Arz']) {
    assert.match(overlay, new RegExp(`>${label}<\\/button>`));
  }
  assert.match(overlay, /data-news-category="halka-arz"/);
  assert.doesNotMatch(overlay, /Politika|Spor|Magazin|Gündem/);
});

test('old market summary and IPO calendar are replaced by the news view boundary', () => {
  assert.match(overlay, /marketsStart/);
  assert.match(overlay, /proStart/);
  assert.match(overlay, /index\.slice\(0, marketsStart\) \+ newsView \+ index\.slice\(proStart\)/);
  assert.doesNotMatch(overlay, /id="marketSummary"/);
  assert.doesNotMatch(overlay, /id="calendarList"/);
});

test('cards expose source, breaking marker and shared comments without unsafe html rendering', () => {
  assert.match(overlay, /SON DAKİKA/);
  assert.match(overlay, /Kaynağa Git/);
  assert.match(overlay, /Yorumlar \(/);
  assert.match(overlay, /Kullanıcı adı/);
  assert.match(overlay, /Yorum yazın/);
  assert.match(overlay, /financial_news_username_v1/);
  assert.match(overlay, /financial_news_install_id_v1/);
  assert.match(overlay, /\/v1\/news\/\\\$\{encodeURIComponent\(item\.id\)\}\/comments/);
  assert.match(overlay, /textContent = item\.title/);
  assert.match(overlay, /text\.textContent = comment\.text/);
  assert.doesNotMatch(overlay, /comment\.text[^\n]*innerHTML/);
});

test('news uses isolated test backend and markets route loads the news feed', () => {
  assert.match(overlay, /https:\/\/halka-arz-portfoy-news-test\.grass-airboat\.workers\.dev/);
  assert.match(overlay, /if \(next === 'markets'\) loadFinancialNews\(\);/);
  assert.match(overlay, /\/v1\/news\?limit=80/);
  assert.match(overlay, /NEWS_REFRESH_TTL_MS = 2 \* 60 \* 1000/);
});
