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

// Preserve null semantics when prices are actually missing, while treating datedness separately.
{
  const path = 'public/core/domain.js';
  let source = await read(path);
  source = replaceOnce(source,
`  const dailyProfit = !sessionIsToday
    ? 0
    : (currentLots > 0 && currentPrice == null) || previousClose == null
      ? null
      : (currentLots === 0 ? 0 : currentLots * (currentPrice - previousClose)) + saleDayGain - todayWithholdingTax;
  const dailyBase = previousClose != null && dailyBaseLots > 0 ? previousClose * dailyBaseLots : 0;
  const dailyPct = !sessionIsToday
    ? 0
    : dailyProfit == null || !(dailyBase > 0)
      ? null
      : (dailyProfit / dailyBase) * 100;
`,
`  const hasDailyMarketPrices = previousClose != null && (currentLots === 0 || currentPrice != null);
  const dailyProfit = !hasDailyMarketPrices
    ? null
    : !sessionIsToday
      ? 0
      : (currentLots === 0 ? 0 : currentLots * (currentPrice - previousClose)) + saleDayGain - todayWithholdingTax;
  const dailyBase = previousClose != null && dailyBaseLots > 0 ? previousClose * dailyBaseLots : 0;
  const dailyPct = dailyProfit == null || !(dailyBase > 0)
    ? null
    : !sessionIsToday
      ? 0
      : (dailyProfit / dailyBase) * 100;
`, 'domain missing-vs-undated daily quote semantics');
  await write(path, source);
}

// Remove remaining Array.at() usage from runtime UI code for older WebViews.
{
  const path = 'public/app.js';
  let source = await read(path);
  source = replaceOnce(source, '  const last = rows.at(-1);', '  const last = rows[rows.length - 1];', 'chart last row');
  source = replaceOnce(source, "  ctx.textAlign='right'; ctx.fillText(trDate(rows.at(-1).date).replace(/ 20\\d{2}/,''),w-pad.r,h-5);", "  ctx.textAlign='right'; ctx.fillText(trDate(rows[rows.length - 1].date).replace(/ 20\\d{2}/,''),w-pad.r,h-5);", 'chart last date');
  await write(path, source);
}

// Remove remaining Array.at() usage from parsers as well, not only the Yahoo hot path.
{
  const path = 'public/core/parsers.js';
  let source = await read(path);
  source = replaceOnce(source,
    "  return cleanTicker(matches.at(-1) || '');",
    "  return cleanTicker((matches.length ? matches[matches.length - 1] : '') || '');",
    'company ticker last match');
  source = replaceOnce(source,
    '    const previous = cardLinks.at(-1);',
    '    const previous = cardLinks.length ? cardLinks[cardLinks.length - 1] : null;',
    'calendar previous card');
  source = replaceOnce(source,
    "      company = headings.find(value => /A\\.?\\s*Ş\\.?/i.test(value)) || headings.at(-1) || null;",
    "      company = headings.find(value => /A\\.?\\s*Ş\\.?/i.test(value)) || (headings.length ? headings[headings.length - 1] : null);",
    'calendar last heading');
  source = replaceOnce(source,
    '  let sector = linkedSectors.at(-1) || null;',
    '  let sector = linkedSectors.length ? linkedSectors[linkedSectors.length - 1] : null;',
    'sector last link');
  await write(path, source);
}

// Remove Array.at() from the Gedik calendar parser.
{
  const path = 'public/core/gedik-calendar.js';
  let source = await read(path);
  source = replaceOnce(source,
    '  return `${days[0]}-${days.at(-1)} ${match[2]}`;',
    '  return `${days[0]}-${days[days.length - 1]} ${match[2]}`;',
    'Gedik last offer day');
  await write(path, source);
}

// Remove Array.at() from portfolio history/quote hydration paths.
{
  const path = 'public/core/portfolio-service.js';
  let source = await read(path);
  source = replaceOnce(source,
`  const priorRecentDate = latestMarketDate
    ? validRecentRows.filter(row => row.date < latestMarketDate).map(row => row.date).sort().at(-1) || null
    : null;`,
`  const priorRecentDates = latestMarketDate
    ? validRecentRows.filter(row => row.date < latestMarketDate).map(row => row.date).sort()
    : [];
  const priorRecentDate = priorRecentDates.length ? priorRecentDates[priorRecentDates.length - 1] : null;`,
    'portfolio prior recent date');
  source = replaceOnce(source,
    '    const quoteLatestMarketDate = quote.latestMarketDate || quoteHistory.at(-1)?.date || null;',
    '    const quoteLatestMarketDate = quote.latestMarketDate || (quoteHistory.length ? quoteHistory[quoteHistory.length - 1]?.date : null) || null;',
    'portfolio quote latest date');
  source = replaceOnce(source,
    '    const latestMarketDate = quoteLatestMarketDate || history.at(-1)?.date || null;',
    '    const latestMarketDate = quoteLatestMarketDate || (history.length ? history[history.length - 1]?.date : null) || null;',
    'portfolio history latest date');
  source = replaceOnce(source,
    '    const lastHistory = history.at(-1);',
    '    const lastHistory = history.length ? history[history.length - 1] : null;',
    'portfolio last history');
  await write(path, source);
}

// Update stale regression: scheduling is independent, but startup must not overwrite saved config with [].
{
  const path = 'test/android-background-parser-regression.test.js';
  let source = await read(path);
  source = replaceOnce(source,
    "  assert.match(app, /syncPushConfiguration\\(\\);\\s*\\napplyNavigationState/);",
    "  assert.doesNotMatch(app, /initTheme\\(\\);\\s*syncPushConfiguration\\(\\);/);\n  assert.match(app, /state\\.portfolio\\s*=\\s*fresh;[\\s\\S]{0,500}syncPushConfiguration\\(\\);/);",
    'background scheduler startup expectation');
  await write(path, source);
}

// Strengthen compatibility coverage so future runtime code cannot silently reintroduce these methods.
{
  const path = 'test/code28-followup-four-regressions.test.js';
  let source = await read(path);
  const marker = "test('Yahoo price parsing still works when newer Array at/findLast/findLastIndex methods are unavailable', () => {";
  const addition = `test('runtime web JavaScript avoids Array at/findLast/findLastIndex for older Android WebViews', async () => {\n  const roots = [new URL('../public/', import.meta.url)];\n  const offenders = [];\n  async function walk(url) {\n    const entries = await fs.readdir(url, { withFileTypes:true });\n    for (const entry of entries) {\n      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url);\n      if (entry.isDirectory()) await walk(child);\n      else if (entry.name.endsWith('.js')) {\n        const text = await fs.readFile(child, 'utf8');\n        if (/\\.at\\s*\\(|\\.findLast(?:Index)?\\s*\\(/.test(text)) offenders.push(child.pathname);\n      }\n    }\n  }\n  for (const root of roots) await walk(root);\n  assert.deepEqual(offenders, []);\n});\n\n`;
  if (!source.includes("runtime web JavaScript avoids Array at/findLast/findLastIndex")) {
    const index = source.indexOf(marker);
    if (index < 0) throw new Error('compatibility test marker not found');
    source = source.slice(0, index) + addition + source.slice(index);
  }
  await write(path, source);
}

console.log('Applied follow-up finalization fixes.');
