import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const wrapper = read('../scripts/apply-test-portfolio-app-navigation.mjs');
const overlayUrl = new URL('../scripts/apply-test-popular-finance-news.mjs', import.meta.url);
const overlay = existsSync(overlayUrl) ? readFileSync(overlayUrl, 'utf8') : '';

test('popular finance news overlay is applied after existing portfolio overlays', () => {
  assert.match(wrapper, /apply-test-popular-finance-news\.mjs/);
});

test('visible Piyasalar navigation is explicitly transformed to Haberler while keeping markets route', () => {
  assert.match(overlay, /data-view=\"markets\"/);
  assert.match(overlay, />Piyasalar<\/b>/);
  assert.match(overlay, />Haberler<\/b>/);
  assert.match(overlay, /markets:\s*\{\s*title:'Haberler'\s*\}/);
  assert.match(overlay, /markets navigation label/);
});

test('approved screen structure has a featured rail and compact latest-news list', () => {
  assert.match(overlay, /Popüler Haberler/);
  assert.match(overlay, /Sadece finans gündemi/);
  assert.match(overlay, /id=\"popularNewsRail\"/);
  assert.match(overlay, /id=\"popularNewsDots\"/);
  assert.match(overlay, /Son Haberler/);
  assert.match(overlay, /id=\"latestNewsList\"/);
  assert.match(overlay, /news-feature-card/);
  assert.match(overlay, /news-latest-item/);
});

test('feed remains finance-only and deliberately excludes social/comment/breaking features', () => {
  for (const label of ['Borsa','Şirketler','Döviz','Altın','Ekonomi','Halka Arz']) {
    assert.match(overlay, new RegExp(label));
  }
  assert.doesNotMatch(overlay, /Kullanıcı adı|Yorum yaz|financial_breaking|Son Dakika bildirimi/i);
});

test('news screen consumes the isolated finance feed and opens original sources', () => {
  assert.match(overlay, /NEWS_HOST = 'halka-arz-portfoy-news-test\.grass-airboat\.workers\.dev'/);
  assert.match(overlay, /\/v1\/news\?limit=60/);
  assert.match(overlay, /httpGetJson\(NEWS_FEED_URL\)/);
  assert.match(overlay, /news-source-link/);
  assert.match(overlay, /item\.url/);
});

test('news feed falls back to CORS fetch when the native Android request path fails', () => {
  assert.match(overlay, /async function fetchPopularFinanceNewsPayload/);
  assert.match(overlay, /await httpGetJson\(NEWS_FEED_URL\)/);
  assert.match(overlay, /fetch\(NEWS_FEED_URL/);
  assert.match(overlay, /response\.ok/);
});
