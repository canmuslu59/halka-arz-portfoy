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
.finance-news-view{display:grid;gap:12px;align-content:start;padding-bottom:26px;min-width:0}
.finance-news-view[hidden]{display:none}
.finance-news-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;padding:4px 1px 2px;min-width:0}
.finance-news-head>div{min-width:0}
.finance-news-head h2{margin:3px 0 0;font-size:clamp(25px,7vw,30px);line-height:1.04;letter-spacing:-.035em}
.finance-news-head p{margin:5px 0 0;color:var(--muted);font-size:12px}
.news-all-pill{min-height:38px;padding:0 13px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.025);color:var(--text);font:inherit;font-size:11px;font-weight:800;display:inline-flex;align-items:center;gap:7px;cursor:pointer;flex:0 0 auto}
.news-all-pill span{font-size:18px;color:var(--muted);line-height:1}
.finance-news-status{min-height:17px;color:var(--muted);font-size:10px;padding:0 2px}
.popular-news-rail{display:flex;gap:12px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scroll-padding-inline:14px;scrollbar-width:none;margin:0 -14px;padding:0 14px 4px;min-width:0}
.popular-news-rail::-webkit-scrollbar{display:none}
.news-feature-card{scroll-snap-align:start;flex:0 0 clamp(278px,84vw,368px);width:clamp(278px,84vw,368px);border:1px solid var(--line);background:var(--card);border-radius:22px;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,.16)}
.news-feature-art{aspect-ratio:16/9;width:100%;position:relative;overflow:hidden;display:flex;align-items:flex-end;padding:clamp(12px,4vw,16px);isolation:isolate;background:#172132}
.news-feature-art:before{content:"";position:absolute;inset:0;z-index:-2;background:radial-gradient(circle at 78% 18%,rgba(255,255,255,.24),transparent 30%),linear-gradient(135deg,rgba(255,255,255,.05),transparent 45%)}
.news-feature-art:after{content:"";position:absolute;left:-8%;right:-5%;bottom:25%;height:52px;z-index:-1;opacity:.7;transform:skewY(-8deg);border-top:3px solid rgba(255,255,255,.5);border-bottom:1px solid rgba(255,255,255,.12)}
.news-art-borsa{background:linear-gradient(145deg,#061426,#0e4b78 52%,#101d38)}
.news-art-altin{background:linear-gradient(145deg,#241604,#b77613 52%,#4f2d05)}
.news-art-doviz{background:linear-gradient(145deg,#07182a,#155e96 50%,#182b52)}
.news-art-ekonomi{background:linear-gradient(145deg,#161229,#5c3e8f 54%,#23163b)}
.news-art-sirketler{background:linear-gradient(145deg,#201208,#95501d 55%,#352012)}
.news-art-halka-arz{background:linear-gradient(145deg,#190b31,#6d3cc8 52%,#251342)}
.news-art-symbol{position:absolute;right:16px;top:17px;font-size:clamp(34px,11vw,46px);font-weight:950;letter-spacing:-.06em;color:rgba(255,255,255,.22);text-shadow:0 12px 35px rgba(0,0,0,.18)}
.news-art-grid{position:absolute;inset:0;opacity:.16;background-image:linear-gradient(rgba(255,255,255,.28) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.28) 1px,transparent 1px);background-size:32px 32px}
.news-category-chip{position:relative;z-index:2;display:inline-flex;align-items:center;min-height:27px;padding:0 10px;border-radius:999px;border:1px solid transparent;backdrop-filter:blur(9px);font-size:10px;font-weight:900;letter-spacing:.01em}
.news-cat-borsa{background:rgba(37,99,235,.24);border-color:rgba(96,165,250,.5);color:#bfdbfe}
.news-cat-sirketler{background:rgba(234,88,12,.23);border-color:rgba(251,146,60,.5);color:#fed7aa}
.news-cat-doviz{background:rgba(5,150,105,.23);border-color:rgba(52,211,153,.46);color:#a7f3d0}
.news-cat-altin{background:rgba(217,119,6,.25);border-color:rgba(251,191,36,.52);color:#fde68a}
.news-cat-ekonomi{background:rgba(225,29,72,.21);border-color:rgba(251,113,133,.48);color:#fecdd3}
.news-cat-halka-arz{background:rgba(124,58,237,.24);border-color:rgba(196,181,253,.5);color:#ddd6fe}
.news-feature-body{padding:clamp(13px,4vw,17px);display:grid;gap:10px}
.news-feature-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--muted);font-size:10px;min-width:0}
.news-source{display:inline-flex;align-items:center;gap:7px;min-width:0;font-weight:800;color:#dfe5ef;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.news-source-dot{width:22px;height:22px;flex:0 0 22px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.1);font-size:8px;color:#fff}
.news-time{flex:0 0 auto;white-space:nowrap;color:var(--muted);font-variant-numeric:tabular-nums}
.news-feature-title{margin:0;color:var(--text);font-size:clamp(16px,4.7vw,18px);line-height:1.3;letter-spacing:-.025em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:calc(1.3em * 3)}
.news-source-link{color:inherit;text-decoration:none;display:block}
.popular-news-dots{display:flex;align-items:center;justify-content:center;gap:7px;min-height:12px}
.popular-news-dot{width:6px;height:6px;border-radius:999px;background:#394457;transition:width .2s ease,background .2s ease}
.popular-news-dot.active{width:16px;background:#44d8ac}
.latest-news-section{border-top:1px solid var(--line);padding-top:17px;display:grid;gap:5px;min-width:0}
.latest-news-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:3px}
.latest-news-head h3{margin:0;font-size:18px;letter-spacing:-.02em}
.latest-news-head span{color:var(--muted);font-size:10px}.latest-news-head b{font-size:16px;margin-left:4px}
.latest-news-list{display:grid;min-width:0}
.news-latest-item{display:grid;grid-template-columns:clamp(70px,21vw,92px) minmax(0,1fr) 16px;gap:clamp(9px,2.8vw,12px);align-items:center;padding:11px 0;border-bottom:1px solid var(--line);text-decoration:none;color:inherit;min-width:0}
.news-latest-thumb{width:100%;aspect-ratio:1.28/1;border-radius:13px;display:grid;place-items:center;overflow:hidden;position:relative;color:rgba(255,255,255,.78);font-size:clamp(15px,4.8vw,20px);font-weight:950}
.news-latest-thumb:after{content:"";position:absolute;inset:0;background:linear-gradient(150deg,transparent,rgba(0,0,0,.25))}
.news-latest-copy{min-width:0;display:grid;gap:6px}.news-latest-copy h4{margin:0;font-size:clamp(12px,3.5vw,14px);line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.news-latest-meta{display:flex;align-items:center;gap:6px;min-width:0;color:var(--muted);font-size:9px;white-space:nowrap;overflow:hidden}
.news-latest-meta>span:not(.news-latest-category){overflow:hidden;text-overflow:ellipsis}
.news-latest-category{display:inline-flex;align-items:center;flex:0 0 auto;min-height:22px;padding:2px 7px;border-radius:999px;border:1px solid transparent;font-weight:850;font-size:9px}
.news-latest-arrow{color:#7f8ba0;font-size:20px;text-align:right}
.finance-news-empty{border:1px dashed var(--line);border-radius:18px;padding:28px 18px;text-align:center;color:var(--muted);font-size:12px}
@media(max-width:390px){.finance-news-view{gap:10px}.finance-news-head h2{font-size:25px}.news-all-pill{min-height:34px;padding:0 10px}.news-feature-card{flex-basis:clamp(252px,86vw,312px);width:clamp(252px,86vw,312px);border-radius:19px}.news-feature-body{padding:13px}.news-feature-meta{font-size:9px}.news-source-dot{width:20px;height:20px;flex-basis:20px}.news-latest-item{grid-template-columns:clamp(64px,20vw,78px) minmax(0,1fr) 14px;gap:8px;padding:9px 0}.news-latest-copy{gap:5px}.news-latest-meta{gap:5px;font-size:8px}.news-latest-category{min-height:20px;padding:2px 6px;font-size:8px}.news-latest-arrow{font-size:18px}}
@media(min-width:600px){.popular-news-rail{margin:0;padding-inline:1px;scroll-padding-inline:1px}.news-feature-card{flex-basis:clamp(320px,46vw,390px);width:clamp(320px,46vw,390px)}.news-latest-item{grid-template-columns:clamp(82px,12vw,100px) minmax(0,1fr) 18px}.news-latest-copy h4{font-size:14px}}
html[data-theme="light"] .news-all-pill{background:#fff;border-color:#dfe5ee;color:#344057}
html[data-theme="light"] .news-feature-card{background:#fff;border-color:#dfe5ee;box-shadow:0 14px 34px rgba(48,62,93,.09)}
html[data-theme="light"] .news-source{color:#4a5870}
html[data-theme="light"] .news-cat-borsa{background:#dbeafe;border-color:#93c5fd;color:#1d4ed8}
html[data-theme="light"] .news-cat-sirketler{background:#ffedd5;border-color:#fdba74;color:#c2410c}
html[data-theme="light"] .news-cat-doviz{background:#d1fae5;border-color:#6ee7b7;color:#047857}
html[data-theme="light"] .news-cat-altin{background:#fef3c7;border-color:#fcd34d;color:#a16207}
html[data-theme="light"] .news-cat-ekonomi{background:#ffe4e6;border-color:#fda4af;color:#be123c}
html[data-theme="light"] .news-cat-halka-arz{background:#ede9fe;border-color:#c4b5fd;color:#6d28d9}
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
const FINANCE_NEWS_CLOCK_FMT = new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'});
const FINANCE_NEWS_DAY_FMT = new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'numeric',month:'short'});
const FINANCE_NEWS_DAY_KEY_FMT = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'});
let popularFinanceNewsItems = [];
let popularFinanceNewsFetchedAt = 0;
let popularFinanceNewsPromise = null;

function parseFinanceNewsDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = /(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(raw) ? raw : raw + '+03:00';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatFinanceNewsTime(iso) {
  const date = parseFinanceNewsDate(iso);
  if (!date) return 'Güncel';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return Math.abs(diffMs) < 5 * 60 * 1000 ? 'Şimdi' : 'Güncel';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Şimdi';
  if (minutes < 60) return minutes + ' dk önce';
  const todayKey = FINANCE_NEWS_DAY_KEY_FMT.format(now);
  const dateKey = FINANCE_NEWS_DAY_KEY_FMT.format(date);
  const yesterdayKey = FINANCE_NEWS_DAY_KEY_FMT.format(new Date(now.getTime() - 86_400_000));
  if (dateKey === todayKey) return Math.floor(minutes / 60) + ' saat önce';
  const clock = FINANCE_NEWS_CLOCK_FMT.format(date);
  if (dateKey === yesterdayKey) return 'Dün ' + clock;
  return FINANCE_NEWS_DAY_FMT.format(date) + ' • ' + clock;
}

const GENERIC_FINANCE_NEWS_TITLES = new Set([
  'hisse senetleri','borsa kapanış','çeyrek altın','cumhuriyet altını','ziynet altını',
  'yatırım fonları','halka arz takvimi','ekonomi haberleri','borsa haberleri',
  'altın fiyatları','gram altın fiyatı','çeyrek altın fiyatı'
]);

function financeNewsCleanTitle(value) {
  return String(value || '').replace(/\s+/g,' ').trim().replace(/^(?:HABERLER|PİYASALAR)\s+/iu,'').trim();
}

function financeNewsIsArticle(item) {
  if (!item?.url) return false;
  try {
    const url = new URL(String(item.url));
    const host = url.hostname.toLocaleLowerCase('tr-TR');
    if ((host === 'bloomberght.com' || host === 'www.bloomberght.com') && !/-\d{6,}\/?$/u.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function financeNewsItemsOnly(items) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item && NEWS_CATEGORY_NAMES[item.category] && item.title && item.url && financeNewsIsArticle(item))
    .map(item => ({ ...item, title:financeNewsCleanTitle(item.title) }))
    .filter(item => !GENERIC_FINANCE_NEWS_TITLES.has(item.title.toLocaleLowerCase('tr-TR')))
    .slice()
    .sort((a,b) => (parseFinanceNewsDate(b.publishedAt)?.getTime() || 0) - (parseFinanceNewsDate(a.publishedAt)?.getTime() || 0));
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

function financeNewsCategoryClass(category) {
  return 'news-cat-' + (NEWS_CATEGORY_NAMES[category] ? category : 'ekonomi');
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
          '<span class="news-category-chip ' + financeNewsCategoryClass(item.category) + '">' + esc(category) + '</span>' +
        '</div>' +
        '<div class="news-feature-body">' +
          '<div class="news-feature-meta"><span class="news-source"><span class="news-source-dot">' + esc(financeNewsSourceInitial(item.source)) + '</span>' + esc(item.source || 'Finans') + '</span><span class="news-time">' + esc(formatFinanceNewsTime(item.publishedAt)) + '</span></div>' +
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
      '<span class="news-latest-copy"><span class="news-latest-meta"><span class="news-latest-category ' + financeNewsCategoryClass(item.category) + '">' + esc(category) + '</span><span>' + esc(item.source || 'Finans') + '</span><span class="news-time">' + esc(formatFinanceNewsTime(item.publishedAt)) + '</span></span><h4>' + esc(item.title) + '</h4></span>' +
      '<span class="news-latest-arrow">›</span>' +
    '</a>';
  }).join('');

  status.textContent = 'Finans gündemi · ' + items.length + ' haber';

  if (!rail.dataset.newsDotsBound) {
    rail.dataset.newsDotsBound = '1';
    rail.addEventListener('scroll', () => {
      const cards = $$('.news-feature-card', rail);
      if (!cards.length) return;
      const cardWidth = cards[0].getBoundingClientRect().width + 12;
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

console.log('Applied approved responsive finance-news screen with category colors and Istanbul-aware timing.');