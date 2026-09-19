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

function replaceFunction(text, signature, replacement, label) {
  const start = text.indexOf(signature);
  if (start < 0) throw new Error(`${label}: function signature not found`);
  const braceOffset = signature.lastIndexOf('{');
  const braceStart = braceOffset >= 0
    ? start + braceOffset
    : text.indexOf('{', start + signature.length);
  if (braceStart < 0) throw new Error(`${label}: function opening brace not found`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = braceStart; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(0, start) + replacement + text.slice(index + 1);
      }
    }
  }
  throw new Error(`${label}: function closing brace not found`);
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

app = replaceFunction(
  app,
  'async function loadHomeComparison({ force = false } = {}) {',
  loadReplacement,
  'aligned comparison loader',
);

writeFileSync(appPath, app);

let index = readFileSync(indexPath, 'utf8');
index = index.replaceAll('<span>Altın (TL)</span>', '<span title="Ons altın × USD/TRY bazlı">Ons Altın (TL)</span>');
writeFileSync(indexPath, index);

console.log('Applied isolated comparison accuracy fix: current-day daily values, BIST-aligned periods, and cash-flow-neutral portfolio returns.');
