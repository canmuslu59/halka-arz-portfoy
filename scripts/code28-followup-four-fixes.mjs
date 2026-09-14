import fs from 'node:fs/promises';

async function read(path) { return fs.readFile(path, 'utf8'); }
async function write(path, value) { await fs.writeFile(path, value); }
function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: expected source occurs more than once`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

// 1) Let WebView handle JavaScript confirm() with the platform dialog.
{
  const path = 'android/app/src/main/java/com/innative/halkaarz/MainActivity.java';
  let source = await read(path);
  source = replaceOnce(
    source,
    'import android.webkit.WebView;\nimport android.webkit.WebViewClient;',
    'import android.webkit.WebView;\nimport android.webkit.WebChromeClient;\nimport android.webkit.WebViewClient;',
    'MainActivity WebChromeClient import',
  );
  source = replaceOnce(
    source,
    '        view.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");\n        view.setWebViewClient(',
    '        view.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");\n        view.setWebChromeClient(new WebChromeClient());\n        view.setWebViewClient(',
    'MainActivity WebChromeClient setup',
  );
  await write(path, source);
}

// 2) Do not replace a previously valid native push registration with [] before portfolio restore succeeds.
{
  const path = 'public/app.js';
  let source = await read(path);
  source = replaceOnce(
    source,
    'initTheme();\nsyncPushConfiguration();\napplyNavigationState(window.history.state);',
    'initTheme();\napplyNavigationState(window.history.state);',
    'startup push sync',
  );
  await write(path, source);
}

// 3) A quote without a market date cannot prove that it belongs to today's BIST session.
{
  const path = 'public/core/domain.js';
  let source = await read(path);
  source = replaceOnce(
    source,
    '  const sessionIsToday = !today || !latestMarketDate || latestMarketDate === today;',
    '  const sessionIsToday = !today || latestMarketDate === today;',
    'undated quote session guard',
  );
  await write(path, source);
}

// 4) Avoid Array.at/findLast/findLastIndex in the hot Yahoo quote parser for older Android WebViews.
{
  const path = 'public/core/parsers.js';
  let source = await read(path);
  source = replaceOnce(
    source,
`  const latestTick = ticks.at(-1) || null;
  const metaEpoch = Number(meta.regularMarketTime);
  const marketEpoch = Math.max(Number.isFinite(metaEpoch) ? metaEpoch : 0, latestTick?.epoch || 0) || null;
  const latestMarketDate = marketEpoch ? dateInZone(marketEpoch) : rows.at(-1)?.date || null;
  const exactLatestIndex = latestMarketDate ? rows.findLastIndex(row => row.date === latestMarketDate) : rows.length - 1;
  const latestCompletedBeforeMarket = latestMarketDate ? rows.findLast(row => row.date < latestMarketDate) : null;
  const latestRow = exactLatestIndex >= 0 ? rows[exactLatestIndex] : rows.at(-1) || null;
  const previousRow = exactLatestIndex > 0
    ? rows[exactLatestIndex - 1]
    : exactLatestIndex < 0
      ? latestCompletedBeforeMarket
      : null;
  const lastClose = latestRow?.close ?? rows.at(-1)?.close ?? null;
`,
`  const latestTick = ticks.length ? ticks[ticks.length - 1] : null;
  const metaEpoch = Number(meta.regularMarketTime);
  const marketEpoch = Math.max(Number.isFinite(metaEpoch) ? metaEpoch : 0, latestTick?.epoch || 0) || null;
  const lastRow = rows.length ? rows[rows.length - 1] : null;
  const latestMarketDate = marketEpoch ? dateInZone(marketEpoch) : lastRow?.date || null;
  let exactLatestIndex = rows.length - 1;
  if (latestMarketDate) {
    exactLatestIndex = -1;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].date === latestMarketDate) {
        exactLatestIndex = i;
        break;
      }
    }
  }
  let latestCompletedBeforeMarket = null;
  if (latestMarketDate) {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].date < latestMarketDate) {
        latestCompletedBeforeMarket = rows[i];
        break;
      }
    }
  }
  const latestRow = exactLatestIndex >= 0 ? rows[exactLatestIndex] : lastRow;
  const previousRow = exactLatestIndex > 0
    ? rows[exactLatestIndex - 1]
    : exactLatestIndex < 0
      ? latestCompletedBeforeMarket
      : null;
  const lastClose = latestRow?.close ?? lastRow?.close ?? null;
`,
    'Yahoo quote Array compatibility',
  );
  await write(path, source);
}

console.log('Applied four Code28 follow-up fixes.');
