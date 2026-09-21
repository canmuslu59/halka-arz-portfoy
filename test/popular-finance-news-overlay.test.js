import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const wrapper = read('../scripts/apply-test-portfolio-app-navigation.mjs');
const overlayUrl = new URL('../scripts/apply-test-popular-finance-news.mjs', import.meta.url);
const overlay = existsSync(overlayUrl) ? readFileSync(overlayUrl, 'utf8') : '';
const fallbackUrl = new URL('../scripts/apply-test-popular-finance-news-fallback.mjs', import.meta.url);
const fallback = existsSync(fallbackUrl) ? readFileSync(fallbackUrl, 'utf8') : '';

test('popular finance news overlay is applied after existing portfolio overlays', () => {
  assert.match(wrapper, /apply-test-popular-finance-news\.mjs/);
  assert.match(wrapper, /apply-test-popular-finance-news-fallback\.mjs/);
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

test('finance news uses an Istanbul-aware dedicated time formatter instead of generic app timeAgo', () => {
  assert.match(overlay, /function formatFinanceNewsTime\(/);
  assert.match(overlay, /timeZone:'Europe\/Istanbul'/);
  assert.match(overlay, /dk önce/);
  assert.match(overlay, /saat önce/);
  assert.match(overlay, /Dün/);
  assert.match(overlay, /Güncel/);
  assert.match(overlay, /formatFinanceNewsTime\(item\.publishedAt\)/);
  assert.doesNotMatch(overlay, /timeAgo\(item\.publishedAt\)/);
});

test('finance categories render as distinct colored chips in featured and latest cards', () => {
  assert.match(overlay, /function financeNewsCategoryClass\(/);
  for (const category of ['borsa','sirketler','doviz','altin','ekonomi','halka-arz']) {
    assert.match(overlay, new RegExp(`news-cat-${category.replace('-', '\\-')}`));
  }
  assert.match(overlay, /news-category-chip ' \+ financeNewsCategoryClass\(item\.category\)/);
  assert.match(overlay, /news-latest-category ' \+ financeNewsCategoryClass\(item\.category\)/);
});

test('popular and latest news layout is responsive to phone width with a 16 by 9 media surface', () => {
  assert.match(overlay, /\.news-feature-card\{[^}]*clamp\(/s);
  assert.match(overlay, /\.news-feature-art\{[^}]*aspect-ratio:16\/9/s);
  assert.match(overlay, /\.news-feature-title\{[^}]*-webkit-line-clamp:3/s);
  assert.match(overlay, /\.news-latest-item\{[^}]*grid-template-columns:clamp\(/s);
  assert.match(overlay, /@media\(max-width:390px\)/);
  assert.match(overlay, /@media\(min-width:600px\)/);
});

test('news feed has three-stage fallback including direct AA economy source', () => {
  assert.match(fallback, /async function fetchPopularFinanceNewsPayload/);
  assert.match(fallback, /await httpGetJson\(NEWS_FEED_URL\)/);
  assert.match(fallback, /fetch\(NEWS_FEED_URL/);
  assert.match(fallback, /AA_FINANCE_URL/);
  assert.match(fallback, /https:\/\/www\.aa\.com\.tr\/tr\/ekonomi/);
  assert.match(fallback, /await httpGetText\(AA_FINANCE_URL\)/);
  assert.match(fallback, /parseAaFinanceFallback/);
  assert.match(fallback, /Anadolu Ajansı/);
  assert.match(fallback, /www\.aa\.com\.tr/);
});

test('AA fallback never fabricates a publication time when the source list has no reliable timestamp', () => {
  assert.match(fallback, /publishedAt:\s*null/);
  assert.doesNotMatch(fallback, /publishedAt:\s*new Date\(\)\.toISOString\(\)/);
});

test('empty news state preserves the actual runtime failure reason for device diagnostics', () => {
  assert.match(fallback, /financeNewsLastError/);
  assert.match(fallback, /Haberler alınamadı/);
  assert.match(fallback, /status\.textContent = financeNewsLastError/);
  assert.match(fallback, /esc\(financeNewsLastError/);
});


test('Haberler UI filters Bloomberg quote/category pages and strips feed prefixes', () => {
  assert.match(overlay, /GENERIC_FINANCE_NEWS_TITLES/);
  assert.match(overlay, /function financeNewsIsArticle\(/);
  assert.ok(overlay.includes("!/-\\\\d{6,}\\\\/?$/u.test(url.pathname)"));
  assert.match(overlay, /function financeNewsCleanTitle\(/);
  assert.match(overlay, /HABERLER\|PİYASALAR/);
  assert.match(overlay, /financeNewsIsArticle\(item\)/);
});
