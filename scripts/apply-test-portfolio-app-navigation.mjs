import { readFileSync, writeFileSync } from 'node:fs';

const indexPath = 'android/app/src/main/assets/www/index.html';
const appPath = 'android/app/src/main/assets/www/app.js';
const stylesPath = 'android/app/src/main/assets/www/styles.css';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, () => replacement);
}

function requireMarker(text, marker, label) {
  if (!text.includes(marker)) throw new Error(`${label}: ${marker} not found`);
}

let index = readFileSync(indexPath, 'utf8');
for (const marker of ['calendarRefreshBtn', 'calendarStatus', 'calendarFilter', 'calendarList']) {
  requireMarker(index, marker, 'IPO calendar contract');
}

const comparisonStart = index.indexOf('    <section id="comparisonCard"');
const performanceStart = index.indexOf('    <section class="chart-card">', comparisonStart);
if (comparisonStart < 0 || performanceStart < 0) throw new Error('comparison card / performance block boundary not found');
const focusedComparison = `    <section id="comparisonCard" class="comparison-card portfolio-comparison-card" aria-label="Portföy karşılaştırması">
      <div class="comparison-head"><span class="eyebrow">KARŞILAŞTIRMA</span></div>
      <div class="comparison-range" role="tablist" aria-label="Karşılaştırma dönemi">
        <button id="comparisonRangeDaily" class="comparison-range-btn active" data-comparison-range="daily" type="button">Günlük</button>
        <button id="comparisonRangeWeekly" class="comparison-range-btn" data-comparison-range="weekly" type="button">Haftalık</button>
        <button id="comparisonRangeMonthly" class="comparison-range-btn" data-comparison-range="monthly" type="button">Aylık</button>
      </div>
      <div class="comparison-grid comparison-grid-expanded">
        <div class="comparison-item portfolio"><span>Portföy</span><strong id="comparisonPortfolio">—</strong></div>
        <div class="comparison-item"><span>Altın (TL)</span><strong id="comparisonGold">—</strong></div>
        <div class="comparison-item"><span>BIST 100</span><strong id="comparisonBist">—</strong></div>
        <div class="comparison-item"><span>Dolar</span><strong id="comparisonUsd">—</strong></div>
      </div>
    </section>

`;
index = index.slice(0, comparisonStart) + focusedComparison + index.slice(performanceStart);

const analyticsStart = index.indexOf('    <section class="chart-card">', comparisonStart + focusedComparison.length);
const holdingsStart = index.indexOf('    <section class="section holdings-section">', analyticsStart);
const calendarOpen = '    <section id="calendarView" class="app-view" hidden>';
const portfolioCloseMarker = `    </section>\n\n${calendarOpen}`;
const portfolioCloseStart = index.indexOf(portfolioCloseMarker, holdingsStart);
const holdingsEnd = portfolioCloseStart;
if (analyticsStart < 0 || holdingsStart < 0 || holdingsEnd < 0) throw new Error('performance / holdings / wallet view boundaries not found');
const performanceContent = index.slice(analyticsStart, holdingsStart);
const holdingsContent = index.slice(holdingsStart, holdingsEnd);
requireMarker(performanceContent, 'id="dailyHistory"', 'performance analytics');
requireMarker(performanceContent, 'id="sectorAllocation"', 'performance analytics');
requireMarker(holdingsContent, 'id="holdings"', 'holdings content');
requireMarker(holdingsContent, 'id="holdingSort"', 'holdings content');

// Wallet home only two cards: wallet summary + comparison. Analytics and holdings move to dedicated views.
index = index.slice(0, analyticsStart) + index.slice(portfolioCloseStart);
const holdingsPerformanceMarkets = `    <section id="holdingsView" class="app-view" hidden>
${holdingsContent}    </section>

    <section id="performanceView" class="app-view" hidden>
${performanceContent}    </section>

    <section id="marketsView" class="app-view" hidden>
      <section class="view-hero markets-hero">
        <div><span class="eyebrow">PİYASALAR</span><h2>Piyasa Özeti</h2></div>
      </section>
      <section id="marketSummary" class="market-summary" aria-label="Piyasa özeti">
        <div class="market-summary-item"><span>BIST 100</span><strong id="marketSummaryBist">—</strong></div>
        <div class="market-summary-item"><span>Altın (TL)</span><strong id="marketSummaryGold">—</strong></div>
        <div class="market-summary-item"><span>Dolar</span><strong id="marketSummaryUsd">—</strong></div>
      </section>`;
index = replaceOnce(index, calendarOpen, holdingsPerformanceMarkets, 'holdings performance and markets views');

index = replaceOnce(
  index,
  `    <button id="portfolioTab" class="nav-tab active" data-view="portfolio" type="button"><span>▦</span><b>Portföy</b></button>
    <button id="calendarTab" class="nav-tab" data-view="calendar" type="button"><span>◫</span><b>Takvim</b></button>`,
  `    <button id="holdingsTab" class="nav-tab" data-view="holdings" type="button"><span>▦</span><b>Hisselerim</b></button>
    <button id="performanceTab" class="nav-tab" data-view="performance" type="button"><span>↗</span><b>Performans</b></button>`,
  'bottom navigation holdings and performance tabs'
);
// Remove advanced navigation from the five-item dock; keep proView available for contextual market detail links.
index = replaceOnce(
  index,
  `    <button id="proTab" class="nav-tab" data-view="pro" type="button"><span>✦</span><b>Gelişmiş</b></button>`,
  `    <button id="marketsTab" class="nav-tab" data-view="markets" type="button"><span>⌁</span><b>Piyasalar</b></button>`,
  'replace advanced navigation with markets'
);

index = replaceOnce(
  index,
  `        <div class="holding-title-row">
          <div>
            <div class="ticker-line"><strong class="ticker"></strong><span class="lots"></span></div>
            <div class="company muted"></div><div class="sector-tag"></div>
          </div>
          <div class="price-stack">`,
  `        <div class="holding-title-row">
          <div class="holding-identity">
            <span class="holding-logo-avatar" aria-hidden="true">
              <img class="holding-logo" alt="" hidden />
              <span class="holding-logo-fallback">?</span>
            </span>
            <div class="holding-copy">
              <div class="ticker-line"><strong class="ticker"></strong><span class="lots"></span></div>
              <div class="company muted"></div><div class="sector-tag"></div>
            </div>
          </div>
          <div class="price-stack">`,
  'holding logo avatar template'
);
writeFileSync(indexPath, index);

let styles = readFileSync(stylesPath, 'utf8');
styles += `

/* Test-only portfolio-app navigation. Keep isolated from live/public sources. */
#portfolioView{display:grid;gap:14px;align-content:start}
#portfolioView[hidden]{display:none}
#holdingsView>.holdings-section{margin-top:0}
.portfolio-comparison-card{padding:18px 17px 16px;min-height:184px;display:grid;align-content:start;gap:14px}
.portfolio-comparison-card .comparison-head{align-items:center;min-height:18px}
.comparison-range{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:4px;border-radius:13px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.055)}
.comparison-range-btn{min-height:36px;border:0;border-radius:10px;background:transparent;color:#8190a6;font:inherit;font-size:11px;font-weight:800;cursor:pointer}
.comparison-range-btn.active{background:rgba(109,141,255,.17);color:#e8edff;box-shadow:inset 0 0 0 1px rgba(109,141,255,.18)}
.comparison-grid-expanded{margin-top:0;gap:8px}
.comparison-grid-expanded .comparison-item{padding:13px 7px;gap:5px}
.comparison-grid-expanded .comparison-item span{font-size:10px}.comparison-grid-expanded .comparison-item strong{font-size:14px}
.market-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 16px}
.market-summary-item{border:1px solid var(--line);background:var(--card);border-radius:16px;padding:14px 12px;display:grid;gap:6px;min-width:0}
.market-summary-item span{font-size:10px;color:var(--muted);font-weight:750}.market-summary-item strong{font-size:15px;font-variant-numeric:tabular-nums}
#performanceView>.chart-card:first-child{margin-top:0}
.holding-identity{display:flex;align-items:flex-start;gap:11px;min-width:0}
.holding-copy{min-width:0}
.holding-logo-avatar{width:42px;height:42px;flex:0 0 42px;border-radius:13px;display:grid;place-items:center;overflow:hidden;background:rgba(109,141,255,.12);border:1px solid rgba(109,141,255,.18);color:#aab8ff;font-size:17px;font-weight:900;box-shadow:inset 0 0 0 1px rgba(255,255,255,.025)}
.holding-logo{width:100%;height:100%;object-fit:contain;background:#fff}
.holding-logo-fallback{line-height:1}
.holding-logo-avatar .holding-logo[hidden],.holding-logo-avatar .holding-logo-fallback[hidden]{display:none!important}
@media(max-width:720px){
  #portfolioView{gap:10px}
  .portfolio-comparison-card{min-height:182px;padding:15px 14px 13px;gap:12px}
  .comparison-range-btn{min-height:34px;font-size:10px}
  .comparison-grid-expanded{grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
  .comparison-grid-expanded .comparison-item{padding:11px 4px}.comparison-grid-expanded .comparison-item strong{font-size:12px}
  .market-summary{gap:7px}.market-summary-item{padding:12px 8px;border-radius:14px}.market-summary-item strong{font-size:13px}
  .holding-logo-avatar{width:38px;height:38px;flex-basis:38px;border-radius:12px;font-size:15px}
}
@media(max-width:365px){
  .comparison-grid-expanded{grid-template-columns:repeat(2,minmax(0,1fr))}
  .market-summary{grid-template-columns:1fr}
}
html[data-theme="light"] .portfolio-comparison-card{background:linear-gradient(160deg,#fff,#f7f9ff);border-color:#dfe5f0;box-shadow:0 12px 34px rgba(52,67,103,.09)}
html[data-theme="light"] .comparison-range{background:#f3f5f9;border-color:#e1e6ee}
html[data-theme="light"] .comparison-range-btn{color:#65738a}
html[data-theme="light"] .comparison-range-btn.active{background:#e8edff;color:#314ca6;box-shadow:inset 0 0 0 1px #d3dcff}
html[data-theme="light"] .comparison-item{background:#f7f9fc;border-color:#e5e9f0}
html[data-theme="light"] .comparison-item.portfolio{background:#eef2ff;border-color:#dbe3ff}
html[data-theme="light"] .market-summary-item{background:#fff;border-color:#dfe5ee;box-shadow:0 8px 24px rgba(48,62,93,.06)}
html[data-theme="light"] .holding-logo-avatar{background:#eef2ff;border-color:#dbe3ff;color:#4058ba;box-shadow:none}
html[data-theme="light"] .icon-btn{background:#fff;border-color:#dfe5ee;color:#44516a;box-shadow:0 5px 16px rgba(48,62,93,.07)}
html[data-theme="light"] .close-btn{background:#f3f5f9;border-color:#dfe5ee;color:#36445d}
`;
writeFileSync(stylesPath, styles);

let app = readFileSync(appPath, 'utf8');
app = replaceOnce(
  app,
  `const VIEW_META = {
  portfolio: { title:'Portföyüm' },
  calendar: { title:'Halka Arz Takvimi' },
  pro: { title:'Gelişmiş' },
  settings: { title:'Ayarlar' },
};`,
  `const VIEW_META = {
  portfolio: { title:'Cüzdan' },
  holdings: { title:'Hisselerim' },
  performance: { title:'Performans' },
  markets: { title:'Piyasalar' },
  pro: { title:'Gelişmiş' },
  settings: { title:'Ayarlar' },
};`,
  'view metadata'
);

const comparisonLogicStart = app.indexOf('let homeComparisonData = null;');
const shareTimerStart = app.indexOf('let portfolioShareResetTimer = null;', comparisonLogicStart);
if (comparisonLogicStart < 0 || shareTimerStart < 0) throw new Error('comparison logic boundaries not found');
const comparisonLogic = `let homeComparisonData = null;
let homeComparisonPromise = null;
let homeComparisonFetchedAt = 0;
let homeComparisonRange = 'daily';
const HOME_COMPARISON_TTL_MS = 5 * 60 * 1000;
const comparisonRangeSessions = { daily: 1, weekly: 5, monthly: 22 };

function comparisonMovesFromYahoo(json) {
  const result = json?.chart?.result?.[0];
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close) ? result.indicators.quote[0].close : [];
  const points = closes.map(Number).filter(value => Number.isFinite(value) && value > 0);
  const current = points[points.length - 1];
  const moves = {};
  for (const [range, sessions] of Object.entries(comparisonRangeSessions)) {
    const previous = points[points.length - 1 - sessions];
    moves[range] = Number.isFinite(current) && Number.isFinite(previous) && previous > 0
      ? ((current / previous) - 1) * 100
      : null;
  }
  return moves;
}

async function fetchComparisonSeries(symbol) {
  const url = \`https://query1.finance.yahoo.com/v8/finance/chart/\${encodeURIComponent(symbol)}?range=3mo&interval=1d&includePrePost=false&events=div%2Csplits\`;
  return comparisonMovesFromYahoo(await httpGetJson(url));
}

function combineComparisonMoves(first, second) {
  return Number.isFinite(Number(first)) && Number.isFinite(Number(second))
    ? (((1 + Number(first) / 100) * (1 + Number(second) / 100)) - 1) * 100
    : null;
}

function portfolioComparisonMove(range) {
  if (range === 'daily') {
    const daily = Number(state.portfolio?.totals?.dailyPct);
    return Number.isFinite(daily) ? daily : null;
  }
  const sessions = comparisonRangeSessions[range];
  const rows = (Array.isArray(state.portfolio?.history) ? state.portfolio.history : [])
    .filter(row => Number.isFinite(Number(row?.value)) && Number(row.value) > 0);
  if (!Number.isFinite(sessions) || rows.length <= sessions) return null;
  const current = Number(rows[rows.length - 1]?.value);
  const previous = Number(rows[rows.length - 1 - sessions]?.value);
  return current > 0 && previous > 0 ? ((current / previous) - 1) * 100 : null;
}

function setComparisonMetric(id, value) {
  const el = $(id);
  if (!el) return;
  const numeric = value == null ? null : Number(value);
  el.textContent = Number.isFinite(numeric) ? pct(numeric) : '—';
  el.classList.remove('positive','negative','neutral');
  el.classList.add(Number.isFinite(numeric) ? signClass(numeric) : 'neutral');
}

function renderMarketSummary() {
  const daily = homeComparisonData?.daily || {};
  setComparisonMetric('#marketSummaryGold', daily.goldTlPct ?? null);
  setComparisonMetric('#marketSummaryBist', daily.bistPct ?? null);
  setComparisonMetric('#marketSummaryUsd', daily.usdPct ?? null);
}

function renderHomeComparison() {
  const range = comparisonRangeSessions[homeComparisonRange] ? homeComparisonRange : 'daily';
  const data = homeComparisonData?.[range] || {};
  setComparisonMetric('#comparisonPortfolio', portfolioComparisonMove(range));
  setComparisonMetric('#comparisonGold', data.goldTlPct ?? null);
  setComparisonMetric('#comparisonBist', data.bistPct ?? null);
  setComparisonMetric('#comparisonUsd', data.usdPct ?? null);
  $$('[data-comparison-range]').forEach(button => {
    const active = button.dataset.comparisonRange === range;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  renderMarketSummary();
}

async function loadHomeComparison({ force = false } = {}) {
  if (!force && homeComparisonData && Date.now() - homeComparisonFetchedAt < HOME_COMPARISON_TTL_MS) {
    renderHomeComparison();
    return homeComparisonData;
  }
  if (!force && homeComparisonPromise) return homeComparisonPromise;
  const task = Promise.allSettled([
    fetchComparisonSeries('GC=F'),
    fetchComparisonSeries('XU100.IS'),
    fetchComparisonSeries('TRY=X'),
  ]).then(([goldResult, bistResult, usdResult]) => {
    const gold = goldResult.status === 'fulfilled' ? goldResult.value : {};
    const bist = bistResult.status === 'fulfilled' ? bistResult.value : {};
    const usd = usdResult.status === 'fulfilled' ? usdResult.value : {};
    homeComparisonData = Object.fromEntries(Object.keys(comparisonRangeSessions).map(range => [range, {
      goldTlPct: combineComparisonMoves(gold?.[range], usd?.[range]),
      bistPct: Number.isFinite(Number(bist?.[range])) ? Number(bist[range]) : null,
      usdPct: Number.isFinite(Number(usd?.[range])) ? Number(usd[range]) : null,
    }]));
    homeComparisonFetchedAt = Date.now();
    renderHomeComparison();
    return homeComparisonData;
  }).catch(() => {
    renderHomeComparison();
    return homeComparisonData;
  }).finally(() => {
    if (homeComparisonPromise === task) homeComparisonPromise = null;
  });
  homeComparisonPromise = task;
  return task;
}

`;
app = app.slice(0, comparisonLogicStart) + comparisonLogic + app.slice(shareTimerStart);

const switchStart = app.indexOf('function switchView(view, { push = true, selectedTicker = null } = {}) {');
const switchBoundary = '\n}\n\nfunction marketDataText';
const switchEndStart = app.indexOf(switchBoundary, switchStart);
if (switchStart < 0 || switchEndStart < 0) throw new Error('switchView boundary not found');
const switchEnd = switchEndStart + 2;
const newSwitchView = `function switchView(view, { push = true, selectedTicker = null } = {}) {
  const normalizedView = view === 'calendar' ? 'markets' : view;
  const next = VIEW_META[normalizedView] ? normalizedView : 'portfolio';
  state.view = next;
  Object.keys(VIEW_META).forEach(key => {
    const el = $(\`#\${key}View\`);
    if (el) el.hidden = key !== next;
  });
  $$('.nav-tab').forEach(tab => {
    const active = tab.dataset.view === next;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if ($('#screenTitle')) $('#screenTitle').textContent = VIEW_META[next].title;
  if ($('#addFab')) $('#addFab').hidden = next !== 'holdings';
  if ($('#refreshBtn')) $('#refreshBtn').hidden = !['portfolio','holdings'].includes(next);
  if (next === 'markets') { loadIpoCalendar(); loadHomeComparison(); }
  if (next === 'portfolio') renderHomeComparison();
  if (next === 'performance') requestAnimationFrame(drawChart);
  if (next === 'pro' && typeof renderProView === 'function') renderProView({ selectedTicker });
  if (next === 'settings') renderSettings();
  if (push) {
    const hash = next === 'portfolio' ? '' : \`#\${next}\`;
    window.history.pushState(nextNavigationState(window.history.state, { view:next, ...(selectedTicker ? { selectedTicker } : {}) }), '', \`\${location.pathname}\${location.search}\${hash}\`);
  }
}`;
app = app.slice(0, switchStart) + newSwitchView + app.slice(switchEnd);

app = app.replace("switchView('calendar');", "switchView('markets');");
app = replaceOnce(
  app,
  `const portfolioTab = $('#portfolioTab');
const calendarTab = $('#calendarTab');
const proTab = $('#proTab');
const settingsTab = $('#settingsTab');
[portfolioTab, calendarTab, proTab, settingsTab].filter(Boolean).forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));`,
  `$$('.nav-tab').forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));`,
  'navigation listeners'
);
app = replaceOnce(
  app,
  `$('#chartRange').addEventListener('change', () => { state.chartSelectedIndex = null; renderDailyHistory(); drawChart(); });`,
  `$('#chartRange').addEventListener('change', () => { state.chartSelectedIndex = null; renderDailyHistory(); drawChart(); });
$$('[data-comparison-range]').forEach(button => button.addEventListener('click', () => {
  homeComparisonRange = comparisonRangeSessions[button.dataset.comparisonRange] ? button.dataset.comparisonRange : 'daily';
  renderHomeComparison();
}));`,
  'comparison range listeners'
);

const holdingLogoHelpers = `const holdingLogoCache = new Map();

async function fetchHoldingLogoUrl(ticker) {
  const symbol = String(ticker || '').trim().toLocaleUpperCase('tr-TR');
  if (!symbol) return null;
  if (holdingLogoCache.has(symbol)) return holdingLogoCache.get(symbol);
  const pending = httpGetText(\`https://fintables.com/sirketler/\${encodeURIComponent(symbol)}\`)
    .then(html => {
      const urls = String(html || '').match(/https:\/\/storage\.fintables\.com\/[^"'<>\\s]+/gi) || [];
      const logoUrl = urls.find(url => /company-logos/i.test(url)) || null;
      return logoUrl ? logoUrl.replaceAll('&amp;', '&') : null;
    })
    .catch(() => null);
  holdingLogoCache.set(symbol, pending);
  return pending;
}

async function hydrateHoldingLogo(node, holding) {
  const avatar = $('.holding-logo-avatar', node);
  const logo = $('.holding-logo', node);
  const fallback = $('.holding-logo-fallback', node);
  if (!avatar || !logo || !fallback) return;
  fallback.textContent = String(holding?.ticker || '?').charAt(0).toLocaleUpperCase('tr-TR') || '?';
  fallback.hidden = false;
  logo.hidden = true;
  const logoUrl = await fetchHoldingLogoUrl(holding?.ticker);
  if (!logoUrl) return;
  const showFallback = () => { logo.hidden = true; fallback.hidden = false; };
  logo.addEventListener('error', showFallback, { once:true });
  logo.addEventListener('load', () => { logo.hidden = false; fallback.hidden = true; }, { once:true });
  logo.src = logoUrl;
}

`;
app = replaceOnce(app, 'function renderHolding(h) {', `${holdingLogoHelpers}function renderHolding(h) {`, 'holding logo helpers');
app = replaceOnce(
  app,
  `  $('.holding-main',node).addEventListener('click', () => openDetail(h.id));
  return node;`,
  `  $('.holding-main',node).addEventListener('click', () => openDetail(h.id));
  hydrateHoldingLogo(node, h);
  return node;`,
  'holding logo hydration hook'
);

app = app.replaceAll("state.view === 'calendar'", "state.view === 'markets'");
app = app.replace("if (state.view !== 'portfolio') return;", "if (state.view !== 'portfolio' && state.view !== 'holdings') return;");
app = app.replace(
  "if (state.view === 'portfolio') { loadPortfolio({ quiet:true }); loadHomeComparison(); }",
  "if (state.view === 'portfolio' || state.view === 'holdings') { loadPortfolio({ quiet:true }); if (state.view === 'portfolio') loadHomeComparison(); }"
);
writeFileSync(appPath, app);

console.log('Applied isolated test wallet/holdings/performance/markets navigation + ranged comparison + resilient stock logos overlay.');
