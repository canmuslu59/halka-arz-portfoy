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
if (analyticsStart < 0 || holdingsStart < 0) throw new Error('performance analytics / holdings boundary not found');
const performanceContent = index.slice(analyticsStart, holdingsStart);
requireMarker(performanceContent, 'id="dailyHistory"', 'performance analytics');
requireMarker(performanceContent, 'id="sectorAllocation"', 'performance analytics');
index = index.slice(0, analyticsStart) + index.slice(holdingsStart);

const calendarOpen = '    <section id="calendarView" class="app-view" hidden>';
const performanceAndMarkets = `    <section id="performanceView" class="app-view" hidden>
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
index = replaceOnce(index, calendarOpen, performanceAndMarkets, 'performance and markets views');

index = replaceOnce(
  index,
  `    <button id="portfolioTab" class="nav-tab active" data-view="portfolio" type="button"><span>▦</span><b>Portföy</b></button>
    <button id="calendarTab" class="nav-tab" data-view="calendar" type="button"><span>◫</span><b>Takvim</b></button>`,
  `    <button id="performanceTab" class="nav-tab" data-view="performance" type="button"><span>↗</span><b>Performans</b></button>
    <button id="marketsTab" class="nav-tab" data-view="markets" type="button"><span>⌁</span><b>Piyasalar</b></button>`,
  'bottom navigation first two tabs'
);
writeFileSync(indexPath, index);

let styles = readFileSync(stylesPath, 'utf8');
styles += `

/* Test-only portfolio-app navigation. Keep isolated from live/public sources. */
.portfolio-comparison-card{padding:16px 16px 15px;min-height:150px;display:grid;align-content:start;gap:12px}
.portfolio-comparison-card .comparison-head{align-items:center;min-height:18px}
.comparison-range{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:4px;border-radius:13px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.055)}
.comparison-range-btn{min-height:34px;border:0;border-radius:10px;background:transparent;color:#8190a6;font:inherit;font-size:11px;font-weight:800;cursor:pointer}
.comparison-range-btn.active{background:rgba(109,141,255,.17);color:#e8edff;box-shadow:inset 0 0 0 1px rgba(109,141,255,.18)}
.comparison-grid-expanded{margin-top:0;gap:8px}
.comparison-grid-expanded .comparison-item{padding:12px 7px;gap:5px}
.comparison-grid-expanded .comparison-item span{font-size:10px}.comparison-grid-expanded .comparison-item strong{font-size:14px}
.market-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 16px}
.market-summary-item{border:1px solid var(--line);background:var(--card);border-radius:16px;padding:14px 12px;display:grid;gap:6px;min-width:0}
.market-summary-item span{font-size:10px;color:var(--muted);font-weight:750}.market-summary-item strong{font-size:15px;font-variant-numeric:tabular-nums}
#performanceView>.chart-card:first-child{margin-top:0}
@media(max-width:720px){
  .portfolio-comparison-card{min-height:142px;padding:13px 13px 12px;gap:10px}
  .comparison-range-btn{min-height:32px;font-size:10px}
  .comparison-grid-expanded{grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
  .comparison-grid-expanded .comparison-item{padding:10px 4px}.comparison-grid-expanded .comparison-item strong{font-size:12px}
  .market-summary{gap:7px}.market-summary-item{padding:12px 8px;border-radius:14px}.market-summary-item strong{font-size:13px}
}
@media(max-width:365px){
  .comparison-grid-expanded{grid-template-columns:repeat(2,minmax(0,1fr))}
  .market-summary{grid-template-columns:1fr}
}
html[data-theme="light"] .comparison-range{background:rgba(54,75,112,.04);border-color:rgba(54,75,112,.08)}
html[data-theme="light"] .comparison-range-btn.active{background:rgba(74,100,213,.12);color:#314ca6}
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
  if ($('#addFab')) $('#addFab').hidden = next !== 'portfolio';
  if ($('#refreshBtn')) $('#refreshBtn').hidden = next !== 'portfolio';
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
app = app.replaceAll("state.view === 'calendar'", "state.view === 'markets'");
writeFileSync(appPath, app);

console.log('Applied isolated test portfolio navigation + performance/markets + ranged comparison overlay.');
