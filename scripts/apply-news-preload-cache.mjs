import { readFileSync, writeFileSync } from 'node:fs';

const appPath = 'android/app/src/main/assets/www/app.js';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, () => replacement);
}

let app = readFileSync(appPath, 'utf8');

const renderMarker = 'function renderPopularFinanceNews() {';
const preloadHelpers = `const FINANCE_NEWS_CACHE_KEY = 'finance_news_cache_v3';
const FINANCE_NEWS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FINANCE_NEWS_BACKGROUND_REFRESH_MS = 2 * 60 * 1000;
const financeNewsPreloadRefs = new Map();

function persistFinanceNewsCache(items) {
  try {
    const safeItems = financeNewsItemsOnly(items).slice(0, 40);
    localStorage.setItem(FINANCE_NEWS_CACHE_KEY, JSON.stringify({
      fetchedAt: Date.now(),
      items: safeItems,
    }));
  } catch {}
}

function restoreFinanceNewsCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(FINANCE_NEWS_CACHE_KEY) || 'null');
    const fetchedAt = Number(cached?.fetchedAt || 0);
    if (!Array.isArray(cached?.items) || !cached.items.length) return false;
    if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > FINANCE_NEWS_CACHE_MAX_AGE_MS) return false;
    popularFinanceNewsItems = financeNewsItemsOnly(cached.items);
    popularFinanceNewsFetchedAt = fetchedAt;
    preloadFinanceNewsImages(popularFinanceNewsItems);
    renderPopularFinanceNews();
    return popularFinanceNewsItems.length > 0;
  } catch {
    return false;
  }
}

function preloadFinanceNewsImages(items, limit = 12) {
  if (typeof Image !== 'function') return;
  const urls = [];
  const seen = new Set();
  for (const item of financeNewsItemsOnly(items)) {
    const url = normalizeFinanceArticleImageUrl(item?.imageUrl, item?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= limit) break;
  }
  for (const url of urls) {
    if (financeNewsPreloadRefs.has(url)) continue;
    const image = new Image();
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.onload = image.onerror = () => {
      setTimeout(() => financeNewsPreloadRefs.delete(url), 30_000);
    };
    financeNewsPreloadRefs.set(url, image);
    image.src = url;
  }
}

`;

app = replaceOnce(app, renderMarker, preloadHelpers + renderMarker, 'news preload helpers');

const fastPipelineNeedle = `    .then(async payload => {
      financeNewsLastError = '';
      const enrichedItems = await enrichFinanceNewsItems(payload?.items);
      popularFinanceNewsItems = financeNewsItemsOnly(enrichedItems);`;
const fastPipelineReplacement = `    .then(async payload => {
      financeNewsLastError = '';
      const feedItems = financeNewsItemsOnly(payload?.items);
      if (feedItems.length) {
        popularFinanceNewsItems = feedItems;
        popularFinanceNewsFetchedAt = Date.now();
        persistFinanceNewsCache(popularFinanceNewsItems);
        preloadFinanceNewsImages(popularFinanceNewsItems);
        renderPopularFinanceNews();
      }
      const enrichedItems = await enrichFinanceNewsItems(payload?.items);
      popularFinanceNewsItems = financeNewsItemsOnly(enrichedItems);`;
app = replaceOnce(app, fastPipelineNeedle, fastPipelineReplacement, 'two-stage news render');

const successNeedle = `      popularFinanceNewsFetchedAt = Date.now();
      renderPopularFinanceNews();
      return popularFinanceNewsItems;`;
const successReplacement = `      popularFinanceNewsFetchedAt = Date.now();
      persistFinanceNewsCache(popularFinanceNewsItems);
      preloadFinanceNewsImages(popularFinanceNewsItems);
      renderPopularFinanceNews();
      return popularFinanceNewsItems;`;
app = replaceOnce(app, successNeedle, successReplacement, 'news success cache');

const featureImageNeedle = `<img class="news-feature-image" src="' + esc(item.imageUrl) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true" />`;
const featureImageReplacement = `<img class="news-feature-image" src="' + esc(item.imageUrl) + '" alt="" loading="eager" fetchpriority="high" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true" />`;
app = replaceOnce(app, featureImageNeedle, featureImageReplacement, 'featured news eager image');

const intervalNeedle = `setInterval(() => { if (!document.hidden && state.view === 'markets') loadPopularFinanceNews({ force:true }); }, 120_000);`;
const intervalReplacement = `restoreFinanceNewsCache();
setTimeout(() => { loadPopularFinanceNews(); }, 0);
setInterval(() => {
  if (!document.hidden) loadPopularFinanceNews({ force:true });
}, FINANCE_NEWS_BACKGROUND_REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const stale = !popularFinanceNewsItems.length || Date.now() - popularFinanceNewsFetchedAt >= NEWS_REFRESH_TTL_MS;
  if (stale) loadPopularFinanceNews({ force:true });
});`;
app = replaceOnce(app, intervalNeedle, intervalReplacement, 'background news refresh');

writeFileSync(appPath, app);
console.log('Applied instant finance-news cache, startup preload, image prefetch, and 2-minute background refresh.');
