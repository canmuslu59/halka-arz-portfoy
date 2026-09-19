import { readFileSync, writeFileSync } from 'node:fs';

const appPath = 'android/app/src/main/assets/www/app.js';
const indexPath = 'android/app/src/main/assets/www/index.html';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, () => replacement);
}

function replaceSection(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`${label}: section boundary not found`);
  return text.slice(0, start) + replacement + '\n\n' + text.slice(end);
}

let app = readFileSync(appPath, 'utf8');

const importAnchor = "import { createRefreshGate } from './core/refresh-coordinator.js';";
app = replaceOnce(
  app,
  importAnchor,
  importAnchor + "\nimport { comparisonSeriesFromYahoo, comparisonWindowFromBist, percentageMoveBetweenDates, combinedPercentageMoveBetweenDates, compoundedPortfolioMove } from './core/comparison-math.js';",
  'comparison math import',
);

const comparisonReplacement = `async function fetchComparisonSeries(symbol) {
  const url = \`https://query1.finance.yahoo.com/v8/finance/chart/\${encodeURIComponent(symbol)}?range=3mo&interval=1d&includePrePost=false&events=div%2Csplits\`;
  return comparisonSeriesFromYahoo(await httpGetJson(url));
}

function portfolioComparisonMove(range) {
  if (range === 'daily') {
    const raw = state.portfolio?.totals?.dailyPct;
    if (raw == null || !Number.isFinite(Number(raw))) return null;
    return Number(raw);
  }
  const reference = homeComparisonData?.[range] || {};
  return compoundedPortfolioMove(
    state.portfolio?.history,
    reference.startDate || null,
    reference.endDate || null,
  );
}`;

app = replaceSection(
  app,
  'function comparisonMovesFromYahoo(json) {',
  'function setComparisonMetric(',
  comparisonReplacement,
  'comparison calculation core',
);

const loadReplacement = `async function loadHomeComparison({ force = false } = {}) {
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
    const gold = goldResult.status === 'fulfilled' ? goldResult.value : [];
    const bist = bistResult.status === 'fulfilled' ? bistResult.value : [];
    const usd = usdResult.status === 'fulfilled' ? usdResult.value : [];
    const today = todayIstanbul();

    homeComparisonData = Object.fromEntries(
      Object.keys(comparisonRangeSessions).map(range => {
        const window = comparisonWindowFromBist(bist, range, {
          today,
          sessions:comparisonRangeSessions,
        });
        if (!window) {
          return [range, {
            goldTlPct:null,
            bistPct:null,
            usdPct:null,
            startDate:null,
            endDate:null,
            sessionActive:false,
          }];
        }

        // "Günlük" gerçekten bugünü ifade eder. BIST bugün işlem görmediyse
        // cuma/perşembe hareketini bugünün hareketi gibi göstermeyiz.
        if (range === 'daily' && !window.sessionActive) {
          return [range, {
            goldTlPct:0,
            bistPct:0,
            usdPct:0,
            startDate:window.startDate,
            endDate:window.endDate,
            sessionActive:false,
          }];
        }

        return [range, {
          goldTlPct:combinedPercentageMoveBetweenDates(gold, usd, window.startDate, window.endDate),
          bistPct:percentageMoveBetweenDates(bist, window.startDate, window.endDate),
          usdPct:percentageMoveBetweenDates(usd, window.startDate, window.endDate),
          startDate:window.startDate,
          endDate:window.endDate,
          sessionActive:true,
        }];
      }),
    );

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
}`;

app = replaceSection(
  app,
  'async function loadHomeComparison({ force = false } = {}) {',
  'function switchView(',
  loadReplacement,
  'aligned comparison loader',
);

writeFileSync(appPath, app);

let index = readFileSync(indexPath, 'utf8');
index = index.replaceAll('<span>Altın (TL)</span>', '<span title="Ons altın × USD/TRY bazlı">Ons Altın (TL)</span>');
writeFileSync(indexPath, index);

console.log('Applied isolated comparison accuracy fix: current-day daily values, BIST-aligned periods, and cash-flow-neutral portfolio returns.');
