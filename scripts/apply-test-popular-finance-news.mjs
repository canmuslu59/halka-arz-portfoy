import { readFileSync, writeFileSync } from 'node:fs';

const indexPath = 'android/app/src/main/assets/www/index.html';
const appPath = 'android/app/src/main/assets/www/app.js';
const stylesPath = 'android/app/src/main/assets/www/styles.css';
const policyPath = 'android/app/src/main/java/com/innative/halkaarz/NativeHttpPolicy.java';
const NEWS_HOST = 'halka-arz-portfoy-news-test.grass-airboat.workers.dev';
const NEWS_FEED_URL = `https://${NEWS_HOST}/v1/news?limit=60`;

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, () => replacement);
}

let index = readFileSync(indexPath, 'utf8');
const marketsStart = index.indexOf('    <section id="marketsView" class="app-view" hidden>');
const proStart = index.indexOf('    <section id="proView" class="app-view" hidden>', marketsStart);
if (marketsStart < 0 || proStart < 0) throw new Error('markets/pro view boundary not found');

const newsView = `    <section id="marketsView" class="app-view finance-news-view" hidden>
      <section class="finance-news-head">
        <div>
          <span class="eyebrow">FİNANS</span>
          <h2>Popüler Haberler</h2>
          <p>Sadece finans gündemi</p>
        </div>
        <button id="newsRefreshBtn" class="news-all-pill" type="button" aria-label="Haberleri yenile">Tümü <span>›</span></button>
      </section>

      <div id="newsStatus" class="finance-news-status">Finans haberleri yükleniyor…</div>
      <div id="popularNewsRail" class="popular-news-rail" aria-label="Popüler finans haberleri"></div>
      <div id="popularNewsDots" class="popular-news-dots" aria-hidden="true"></div>

      <section class="latest-news-section" aria-label="Son finans haberleri">
        <div class="latest-news-head">
          <h3>Son Haberler</h3>
          <span>Tüm Haberler <b>›</b></span>
        </div>
        <div id="latestNewsList" class="latest-news-list"></div>
      </section>
    </section>

`;
index = index.slice(0, marketsStart) + newsView + index.slice(proStart);
index = replaceOnce(
  index,
  `    <button id="marketsTab" class="nav-tab" data-view="markets" type="button"><span>⌁</span><b>Piyasalar</b></button>`,
  `    <button id="marketsTab" class="nav-tab" data-view="markets" type="button"><span>▤</span><b>Haberler</b></button>`,
  'markets navigation label'
);
writeFileSync(indexPath, index);

let styles = readFileSync(stylesPath, 'utf8');
styles += `

/* Test-only approved finance-news screen. No comments or breaking notifications. */
.finance-news-view{display:grid;gap:12px;align-content:start;padding-bottom:26px}
.finance-news-view[hidden]{display:none}
.finance-news-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;padding:4px 1px 2px}
.finance-news-head h2{margin:3px 0 0;font-size:29px;line-height:1.04;letter-spacing:-.035em}
.finance-news-head p{margin:5px 0 0;color:var(--muted);font-size:12px}
.news-all-pill{min-height:38px;padding:0 13px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.025);color:var(--text);font:inherit;font-size:11px;font-weight:800;display:inline-flex;align-items:center;gap:7px;cursor:pointer}
.news-all-pill span{font-size:18px;color:var(--muted);line-height:1}
.finance-news-status{min-height:17px;color:var(--muted);font-size:10px;padding:0 2px}
.popular-news-rail{display:flex;gap:11px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scrollbar-width:none;margin:0 -14px;padding:0 14px 3px}
.popular-news-rail::-webkit-scrollbar{display:none}
.news-feature-card{scroll-snap-align:start;flex:0 0 min(78vw,330px);min-width:260px;border:1px solid var(--line);background:var(--card);border-radius:22px;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,.16)}
.news-feature-art{height:168px;position:relative;overflow:hidden;display:flex;align-items:flex-end;padding:15px;isolation:isolate;background:#172132}
.news-feature-art:before{content:"";position:absolute;inset:0;z-index:-2;background:radial-gradient(circle at 78% 18%,rgba(255,255,255,.24),transparent 30%),linear-gradient(135deg,rgba(255,255,255,.05),transparent 45%)}
.news-feature-art:after{content:"";position:absolute;left:-8%;right:-5%;bottom:25%;height:52px;z-index:-1;opacity:.7;transform:skewY(-8deg);border-top:3px solid rgba(255,255,255,.5);border-bottom:1px solid rgba(255,255,255,.12)}
.news-art-borsa{background:linear-gradient(145deg,#061426,#0e4b78 52%,#101d38)}
.news-art-altin{background:linear-gradient(145deg,#241604,#b77613 52%,#4f2d05)}
.news-art-doviz{background:linear-gradient(145deg,#07182a,#155e96 50%,#182b52)}
.news-art-ekonomi{background:linear-gradient(145deg,#161229,#5c3e8f 54%,#23163b)}
.news-art-sirketler{background:linear-gradient(145deg,#101923,#35546c 55%,#19232c)}
.news-art-halka-arz{background:linear-gradient(145deg,#071e1a,#16735d 52%,#0b2c27)}
.news-art-symbol{position:absolute;right:16px;top:17px;font-size:42px;font-weight:950;letter-spacing:-.06em;color:rgba(255,255,255,.22);text-shadow:0 12px 35px rgba(0,0,0,.18)}
.news-art-grid{position:absolute;inset:0;opacity:.16;background-image:linear-gradient(rgba(255,255,255,.28) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.28) 1px,transparent 1px);background-size:32px 32px}
.news-category-chip{position:relative;z-index:2;display:inline-flex;align-items:center;min-height:27px;padding:0 10px;border-radius:999px;background:rgba(6,10,17,.58);border:1px solid rgba(255,255,255,.2);backdrop-filter:blur(9px);font-size:10px;font-weight:900;color:#fff}
.news-feature-body{padding:14px 15px 16px;display:grid;gap:10px}
.news-feature-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--muted);font-size:10px}
.news-source{display:inline-flex;align-items:center;gap:7px;min-width:0;font-weight:800;color:#dfe5ef}
.news-source-dot{width:22px;height:22px;flex:0 0 22px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.1);font-size:8px;color:#fff}
.news-feature-title{margin:0;color:var(--text);font-size:18px;line-height:1.27;letter-spacing:-.025em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:68px}
.news-source-link{color:inherit;text-decoration:none;display:block}
.popular-news-dots{display:flex;align-items:center;justify-content:center;gap:7px;min-height:12px}
.popular-news-dot{width:6px;height:6px;border-radius:999px;background:#394457;transition:width .2s ease,background .2s ease}
.popular-news-dot.active{width:16px;background:#44d8ac}
.latest-news-section{border-top:1px solid var(--line);padding-top:17px;display:grid;gap:5px}
.latest-news-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:3px}
.latest-news-head h3{margin:0;font-size:18px;letter-spacing:-.02em}
.latest-news-head span{color:var(--muted);font-size:10px}.latest-news-head b{font-size:16px;margin-left:4px}
.latest-news-list{display:grid}
.news-latest-item{display:grid;grid-template-columns:82px minmax(0,1fr) 18px;gap:11px;align-items:center;padding:11px 0;border-bottom:1px solid var(--line);text-decoration:none;color:inherit}
.news-latest-thumb{height:68px;border-radius:13px;display:grid;place-items:center;overflow:hidden;position:relative;color:rgba(255,255,255,.78);font-size:18px;font-weight:950}
.news-latest-thumb:after{content:"";position:absolute;inset:0;background:linear-gradient(150deg,transparent,rgba(0,0,0,.25))}
.news-latest-copy{min-width:0;display:grid;gap:5px}.news-latest-copy h4{margin:0;font-size:13px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.news-latest-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;color:var(--muted);font-size:9px}
.news-latest-category{display:inline-flex;padding:3px 7px;border-radius:999px;border:1px solid var(--line);color:#aebaff;background:rgba(109,141,255,.08);font-weight:800}
.news-latest-arrow{color:#7f8ba0;font-size:20px;text-align:right}
.finance-news-empty{border:1px dashed var(--line);border-radius:18px;padding:28px 18px;text-align:center;color:var(--muted);font-size:12px}
@media(max-width:600px){.finance-news-head h2{font-size:27px}.news-feature-card{flex-basis:78vw}.news-feature-art{height:158px}.news-feature-title{font-size:17px}.news-latest-item{grid-template-columns:76px minmax(0,1fr) 16px}.news-latest-thumb{height:62px}}
html[data-theme="light"] .news-all-pill{background:#fff;border-color:#dfe5ee;color:#344057}
html[data-theme="light"] .news-feature-card{background:#fff;border-color:#dfe5ee;box-shadow:0 14px 34px rgba(48,62,93,.09)}
html[data-theme="light"] .news-source{color:#4a5870}
html[data-theme="light"] .news-latest-category{background:#eef2ff;border-color:#dbe3ff;color:#4058ba}
`;
writeFileSync(stylesPath, styles);

let app = readFileSync(appPath, 'utf8');
app = replaceOnce(app, `  markets: { title:'Piyasalar' },`, `  markets: { title:'Haberler' },`, 'markets view title');
app = replaceOnce(
  app,
  `  if (next === 'markets') { loadIpoCalendar(); loadHomeComparison(); }`,
  `  if (next === 'markets') loadPopularFinanceNews();`,
  'markets loader'
);
app = replaceOnce(
  app,
  `$('#calendarRefreshBtn').addEventListener('click', () => loadIpoCalendar({ force:true }));\n$('#calendarFilter').addEventListener('change', () => renderIpoCalendar());`,
  `$('#newsRefreshBtn')?.addEventListener('click', () => loadPopularFinanceNews({ force:true }));`,
  'calendar listeners to news refresh'
);
app = app.replace(
  `else if (state.view === 'markets') loadIpoCalendar();`,
  `else if (state.view === 'markets') loadPopularFinanceNews();`
);
app = app.replace(
  `setInterval(() => { if (!document.hidden && state.view === 'markets') loadIpoCalendar({ force:true }); }, 300_000);`,
  `setInterval(() => { if (!document.hidden && state.view === 'markets') loadPopularFinanceNews({ force:true }); }, 300_000);`
);

const switchMarker = 'function switchView(view, { push = true, selectedTicker = null } = {}) {';
const switchIndex = app.indexOf(switchMarker);
if (switchIndex < 0) throw new Error('switchView marker not found');
const newsLogic = `const NEWS_FEED_URL = '${NEWS_FEED_URL}';
const NEWS_REFRESH_TTL_MS = 2 * 60 * 1000;
const NEWS_CATEGORY_NAMES = Object.freeze({
  borsa:'Borsa',
  sirketler:'Şirketler',
  doviz:'Döviz',
  altin:'Altın',
  ekonomi:'Ekonomi',
  'halka-arz':'Halka Arz',
});
const NEWS_CATEGORY_SYMBOLS = Object.freeze({
  borsa:'BIST', sirketler:'AŞ', doviz:'$ ₺ €', altin:'◆', ekonomi:'₺', 'halka-arz':'IPO',
});
let popularFinanceNewsItems = [];
let popularFinanceNewsFetchedAt = 0;
let popularFinanceNewsPromise = null;

function financeNewsItemsOnly(items) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item && NEWS_CATEGORY_NAMES[item.category] && item.title && item.url)
    .slice()
    .sort((a,b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
}

function choosePopularFinanceNews(items, limit = 4) {
  const result = [];
  const usedCategories = new Set();
  for (const item of items) {
    if (result.length >= limit) break;
    if (usedCategories.has(item.category)) continue;
    result.push(item);
    usedCategories.add(item.category);
  }
  for (const item of items) {
    if (result.length >= limit) break;
    if (!result.includes(item)) result.push(item);
  }
  return result;
}

function financeNewsArtClass(category) {
  return 'news-art-' + (NEWS_CATEGORY_NAMES[category] ? category : 'ekonomi');
}

function financeNewsSourceInitial(source) {
  const cleaned = String(source || 'Finans').trim();
  return cleaned ? cleaned.charAt(0).toLocaleUpperCase('tr-TR') : 'F';
}

function renderPopularFinanceNews() {
  const rail = $('#popularNewsRail');
  const dots = $('#popularNewsDots');
  const latest = $('#latestNewsList');
  const status = $('#newsStatus');
  if (!rail || !dots || !latest || !status) return;

  const items = financeNewsItemsOnly(popularFinanceNewsItems);
  if (!items.length) {
    rail.innerHTML = '<div class="finance-news-empty">Finans haberleri şu anda görüntülenemiyor. Biraz sonra tekrar deneyin.</div>';
    dots.innerHTML = '';
    latest.innerHTML = '';
    status.textContent = 'Haber akışı bekleniyor';
    return;
  }

  const popular = choosePopularFinanceNews(items, 4);
  const popularIds = new Set(popular.map(item => item.id || item.url));
  const latestItems = items.filter(item => !popularIds.has(item.id || item.url)).slice(0, 10);
  const visibleLatest = latestItems.length ? latestItems : items.slice(0, 8);

  rail.innerHTML = popular.map(item => {
    const category = NEWS_CATEGORY_NAMES[item.category] || 'Ekonomi';
    const symbol = NEWS_CATEGORY_SYMBOLS[item.category] || '₺';
    return '<article class="news-feature-card">' +
      '<a class="news-source-link" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' +
        '<div class="news-feature-art ' + financeNewsArtClass(item.category) + '">' +
          '<span class="news-art-grid"></span>' +
          '<span class="news-art-symbol">' + esc(symbol) + '</span>' +
          '<span class="news-category-chip">' + esc(category) + '</span>' +
        '</div>' +
        '<div class="news-feature-body">' +
          '<div class="news-feature-meta"><span class="news-source"><span class="news-source-dot">' + esc(financeNewsSourceInitial(item.source)) + '</span>' + esc(item.source || 'Finans') + '</span><span>' + esc(timeAgo(item.publishedAt)) + '</span></div>' +
          '<h3 class="news-feature-title">' + esc(item.title) + '</h3>' +
        '</div>' +
      '</a>' +
    '</article>';
  }).join('');

  dots.innerHTML = popular.map((_, index) => '<span class="popular-news-dot' + (index === 0 ? ' active' : '') + '" data-news-dot="' + index + '"></span>').join('');

  latest.innerHTML = visibleLatest.map(item => {
    const category = NEWS_CATEGORY_NAMES[item.category] || 'Ekonomi';
    const symbol = NEWS_CATEGORY_SYMBOLS[item.category] || '₺';
    return '<a class="news-latest-item" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="news-latest-thumb ' + financeNewsArtClass(item.category) + '"><span>' + esc(symbol) + '</span></span>' +
      '<span class="news-latest-copy"><span class="news-latest-meta"><span class="news-latest-category">' + esc(category) + '</span><span>' + esc(item.source || 'Finans') + '</span><span>' + esc(timeAgo(item.publishedAt)) + '</span></span><h4>' + esc(item.title) + '</h4></span>' +
      '<span class="news-latest-arrow">›</span>' +
    '</a>';
  }).join('');

  status.textContent = 'Finans gündemi · ' + items.length + ' haber';

  if (!rail.dataset.newsDotsBound) {
    rail.dataset.newsDotsBound = '1';
    rail.addEventListener('scroll', () => {
      const cards = $$('.news-feature-card', rail);
      if (!cards.length) return;
      const cardWidth = cards[0].getBoundingClientRect().width + 11;
      const index = Math.max(0, Math.min(cards.length - 1, Math.round(rail.scrollLeft / Math.max(1, cardWidth))));
      $$('.popular-news-dot', dots).forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === index));
    }, { passive:true });
  }
}

async function loadPopularFinanceNews({ force = false } = {}) {
  if (!force && popularFinanceNewsItems.length && Date.now() - popularFinanceNewsFetchedAt < NEWS_REFRESH_TTL_MS) {
    renderPopularFinanceNews();
    return popularFinanceNewsItems;
  }
  if (!force && popularFinanceNewsPromise) return popularFinanceNewsPromise;
  const status = $('#newsStatus');
  if (status) status.textContent = 'Finans haberleri yenileniyor…';
  const task = httpGetJson(NEWS_FEED_URL)
    .then(payload => {
      popularFinanceNewsItems = financeNewsItemsOnly(payload?.items);
      popularFinanceNewsFetchedAt = Date.now();
      renderPopularFinanceNews();
      return popularFinanceNewsItems;
    })
    .catch(error => {
      if (status) status.textContent = 'Haberler alınamadı · Yenile ile tekrar deneyin';
      if (!popularFinanceNewsItems.length) renderPopularFinanceNews();
      return popularFinanceNewsItems;
    })
    .finally(() => {
      if (popularFinanceNewsPromise === task) popularFinanceNewsPromise = null;
    });
  popularFinanceNewsPromise = task;
  return task;
}

`;
app = app.slice(0, switchIndex) + newsLogic + app.slice(switchIndex);
writeFileSync(appPath, app);

let policy = readFileSync(policyPath, 'utf8');
policy = replaceOnce(
  policy,
  `            "oyakyatirim.com.tr",\n            "www.oyakyatirim.com.tr"`,
  `            "oyakyatirim.com.tr",\n            "www.oyakyatirim.com.tr",\n            "${NEWS_HOST}"`,
  'test finance news host allowlist'
);
writeFileSync(policyPath, policy);

console.log('Applied approved test-only popular finance news screen with finance-only feed.');
