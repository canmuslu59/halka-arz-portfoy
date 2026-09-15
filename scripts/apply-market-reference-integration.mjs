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

// Foreground quote path: Yahoo current price + independently verified daily reference.
{
  const path = 'public/core/data-sources.js';
  let source = await read(path);
  source = replaceOnce(source,
    "import { parseGedikCalendar } from './gedik-calendar.js';\n",
    "import { parseGedikCalendar } from './gedik-calendar.js';\nimport { parseForeksReferenceText, parseOyakReferenceText, applyTrustedMarketReference } from './market-reference.js';\n",
    'data source market-reference import');
  source = replaceOnce(source,
`export function createDataSources({ getJson, getText }) {
  if (typeof getJson !== 'function' || typeof getText !== 'function') {
    throw new TypeError('HTTP veri fonksiyonları gerekli.');
  }

  async function getQuote(ticker) {
    const key = cleanTicker(ticker);
    if (!key) throw new Error('Geçerli bir hisse kodu girin.');
    const symbol = \`${'${key}'}.IS\`;
    const url = \`https://query1.finance.yahoo.com/v8/finance/chart/${'${encodeURIComponent(symbol)}'}?range=5d&interval=5m&includePrePost=false&events=div%2Csplits\`;
    return parseYahooChart(await getJson(url), key);
  }
`,
`export function createDataSources({ getJson, getText }) {
  if (typeof getJson !== 'function' || typeof getText !== 'function') {
    throw new TypeError('HTTP veri fonksiyonları gerekli.');
  }

  const referenceCache = new Map();
  const REFERENCE_TTL_MS = 10 * 60 * 1000;

  async function getTrustedReference(key) {
    const cached = referenceCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    let reference = null;
    try {
      const text = await getText(\`https://webservice.foreks.com/foreks-web-widget/singlepage/${'${encodeURIComponent(key)}'}?lang=tr\`);
      reference = parseForeksReferenceText(text, key);
    } catch {}
    if (!reference) {
      try {
        const text = await getText(\`https://www.oyakyatirim.com.tr/hisse-detay/${'${encodeURIComponent(key)}'}\`);
        reference = parseOyakReferenceText(text, key);
      } catch {}
    }
    referenceCache.set(key, { value:reference, expiresAt:Date.now() + REFERENCE_TTL_MS });
    return reference;
  }

  async function getQuote(ticker) {
    const key = cleanTicker(ticker);
    if (!key) throw new Error('Geçerli bir hisse kodu girin.');
    const symbol = \`${'${key}'}.IS\`;
    const url = \`https://query1.finance.yahoo.com/v8/finance/chart/${'${encodeURIComponent(symbol)}'}?range=5d&interval=5m&includePrePost=false&events=div%2Csplits\`;
    const [json, reference] = await Promise.all([
      getJson(url),
      getTrustedReference(key).catch(() => null),
    ]);
    return applyTrustedMarketReference(parseYahooChart(json, key), reference);
  }
`, 'foreground trusted quote integration');
  await write(path, source);
}

// Carry trusted reference fields into hydrated holdings used by foreground alerts and totals.
{
  const path = 'public/core/portfolio-service.js';
  let source = await read(path);
  source = replaceOnce(source,
`      currentPrice: nullableFiniteNumber(quote.current),
      previousClose: quotePreviousClose,
      latestMarketDate,
      marketTime: quote.marketTime || null,
      history,
`,
`      currentPrice: nullableFiniteNumber(quote.current),
      previousClose: quotePreviousClose,
      floorPrice: nullableFiniteNumber(quote.floorPrice),
      ceilingPrice: nullableFiniteNumber(quote.ceilingPrice),
      referenceVerified: quote.referenceVerified === true,
      referenceSource: quote.referenceSource || null,
      latestMarketDate,
      marketTime: quote.marketTime || null,
      history,
`, 'portfolio trusted reference hydration');
  await write(path, source);
}

// Foreground local alerts: portfolio threshold also requires every active holding to have a trusted reference.
{
  const path = 'public/app.js';
  let source = await read(path);
  source = replaceOnce(source,
`  const previousState = safeParseLocalJson(LOCAL_ALERT_STATE_KEY);
  const result = evaluateDailyAlerts({
    day:todayIstanbul(),
    threshold:state.alertSettings.threshold,
    enabled:state.alertSettings.enabled,
    holdings:(portfolio.holdings || []).filter(item => Number(item.currentLots || 0) > 0),
    portfolioPct:Number(portfolio.totals?.dailyPct || 0),
    previousState,
  });
`,
`  const previousState = safeParseLocalJson(LOCAL_ALERT_STATE_KEY);
  const activeHoldings = (portfolio.holdings || []).filter(item => Number(item.currentLots || 0) > 0);
  const referencesReady = activeHoldings.length > 0 && activeHoldings.every(item => item.referenceVerified === true);
  const result = evaluateDailyAlerts({
    day:todayIstanbul(),
    threshold:state.alertSettings.threshold,
    enabled:state.alertSettings.enabled,
    holdings:activeHoldings,
    portfolioPct:referencesReady ? Number(portfolio.totals?.dailyPct || 0) : 0,
    previousState,
  });
`, 'foreground portfolio reference gate');
  await write(path, source);
}

// Backend alert engine: production quotes explicitly report referenceVerified; an explicit false blocks both limits and total percentage.
{
  const path = 'backend/alert-engine.js';
  let source = await read(path);
  source = replaceOnce(source,
`    const current = finite(quote?.current);
    const previousClose = finite(quote?.previousClose);
    const dailySessionActive = Boolean(day && quote?.latestMarketDate === day);
    if (!(current > 0) || !(previousClose > 0) || !dailySessionActive) {
      if (currentLots > 0) holdings.push({ ticker, currentPrice:current, previousClose, dailySessionActive:false });
      continue;
    }

    valid += 1;
    if (currentLots > 0) holdings.push({ ticker, currentPrice:current, previousClose, dailySessionActive:true });
`,
`    const current = finite(quote?.current);
    const previousClose = finite(quote?.previousClose);
    const floorPrice = finite(quote?.floorPrice);
    const ceilingPrice = finite(quote?.ceilingPrice);
    const referenceVerified = quote?.referenceVerified !== false;
    const dailySessionActive = Boolean(day && quote?.latestMarketDate === day && referenceVerified);
    if (!(current > 0) || !(previousClose > 0) || !dailySessionActive) {
      if (currentLots > 0) holdings.push({ ticker, currentPrice:current, previousClose, floorPrice, ceilingPrice, referenceVerified:false, dailySessionActive:false });
      continue;
    }

    valid += 1;
    if (currentLots > 0) holdings.push({ ticker, currentPrice:current, previousClose, floorPrice, ceilingPrice, referenceVerified:quote?.referenceVerified === true ? true : undefined, dailySessionActive:true });
`, 'backend trusted reference gate');
  await write(path, source);
}

// Cloudflare quote composition with a short cache for daily fixed reference fields.
{
  const path = 'cloudflare/market-quote.js';
  const content = `import { fetchYahooQuote } from './yahoo-quote.js';
import { parseForeksReferenceText, parseOyakReferenceText, applyTrustedMarketReference } from '../public/core/market-reference.js';

const referenceCache = new Map();
const REFERENCE_TTL_MS = 10 * 60 * 1000;

function keyOf(value) {
  return String(value || '').trim().toUpperCase().replace(/\\.IS$/i, '').replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

async function fetchText(url, fetchImpl) {
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(12_000) : undefined;
  const response = await fetchImpl(url, {
    signal,
    headers:{ 'user-agent':'Mozilla/5.0 Chrome/154 Safari/537.36', accept:'text/html,text/plain,*/*', 'accept-language':'tr-TR,tr;q=0.9,en;q=0.8' },
  });
  if (!response?.ok) throw new Error(\`Reference HTTP \${response?.status || 'unknown'}\`);
  return response.text();
}

export async function fetchTrustedMarketReference(ticker, { fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const key = keyOf(ticker);
  if (!key) return null;
  const stamp = Number(now());
  const cached = referenceCache.get(key);
  if (cached && cached.expiresAt > stamp) return cached.value;

  let reference = null;
  try {
    reference = parseForeksReferenceText(
      await fetchText(\`https://webservice.foreks.com/foreks-web-widget/singlepage/\${encodeURIComponent(key)}?lang=tr\`, fetchImpl),
      key,
    );
  } catch {}
  if (!reference) {
    try {
      reference = parseOyakReferenceText(
        await fetchText(\`https://www.oyakyatirim.com.tr/hisse-detay/\${encodeURIComponent(key)}\`, fetchImpl),
        key,
      );
    } catch {}
  }
  referenceCache.set(key, { value:reference, expiresAt:stamp + REFERENCE_TTL_MS });
  return reference;
}

export async function fetchVerifiedMarketQuote(ticker, { fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const [quote, reference] = await Promise.all([
    fetchYahooQuote(ticker, { fetchImpl }),
    fetchTrustedMarketReference(ticker, { fetchImpl, now }).catch(() => null),
  ]);
  return quote ? applyTrustedMarketReference(quote, reference) : null;
}
`;
  await write(path, content);
}

{
  const path = 'cloudflare/worker.js';
  let source = await read(path);
  source = replaceOnce(source,
    "import { fetchYahooQuote } from './yahoo-quote.js';\n",
    "import { fetchVerifiedMarketQuote } from './market-quote.js';\n",
    'worker verified quote import');
  source = replaceOnce(source,
    '  fetchQuote = ticker => fetchYahooQuote(ticker),',
    '  fetchQuote = ticker => fetchVerifiedMarketQuote(ticker),',
    'worker verified quote default');
  await write(path, source);
}

// Android exact-host allow list for trusted reference sources.
{
  const path = 'android/app/src/main/java/com/innative/halkaarz/NativeHttpPolicy.java';
  let source = await read(path);
  source = replaceOnce(source,
`            "www.fintables.com"
`,
`            "www.fintables.com",
            "webservice.foreks.com",
            "oyakyatirim.com.tr",
            "www.oyakyatirim.com.tr"
`, 'native reference hosts');
  await write(path, source);
}

// Android WorkManager fallback: use Yahoo only for live price and Foreks/OYAK for daily reference/limits.
{
  const path = 'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java';
  let source = await read(path);
  source = replaceOnce(source,
    'import java.util.Set;\n',
    'import java.util.Set;\nimport java.util.regex.Matcher;\nimport java.util.regex.Pattern;\n',
    'worker regex imports');

  source = replaceOnce(source,
`                Quote quote;
                try {
                    quote = fetchQuote(ticker);
                } catch (Exception error) {
                    Log.w(TAG, "Quote fetch failed for " + ticker, error);
                    quoteRetryNeeded |= BackgroundRetryPolicy.shouldRetry(error);
                    continue;
                }
                if (quote == null || !day.equals(quote.marketDate) || !(quote.current > 0) || !(quote.previousClose > 0)) continue;
                validTodayCount += 1;
`,
`                Quote quote;
                MarketReference reference;
                try {
                    quote = fetchQuote(ticker);
                    reference = fetchTrustedMarketReference(ticker);
                } catch (Exception error) {
                    Log.w(TAG, "Quote/reference fetch failed for " + ticker, error);
                    quoteRetryNeeded |= BackgroundRetryPolicy.shouldRetry(error);
                    continue;
                }
                if (quote == null || reference == null || !day.equals(quote.marketDate) || !(quote.current > 0)
                        || !(reference.previousClose > 0) || !(reference.floorPrice > 0) || !(reference.ceilingPrice > reference.floorPrice)) continue;
                double rangeTolerance = Math.max(0.005, tickSize(quote.current) / 2.0 + 1e-8);
                if (quote.current < reference.floorPrice - rangeTolerance || quote.current > reference.ceilingPrice + rangeTolerance) continue;
                validTodayCount += 1;
`, 'worker quote/reference fetch gate');

  source = replaceOnce(source,
`                    double ceiling = ceilingPrice(quote.previousClose);
                    double floor = floorPrice(quote.previousClose);
`,
`                    double ceiling = reference.ceilingPrice;
                    double floor = reference.floorPrice;
`, 'worker exact limits');
  source = source.replaceAll('sale.price - quote.previousClose', 'sale.price - reference.previousClose');
  source = source.replaceAll('quote.previousClose * dailyBaseLots', 'reference.previousClose * dailyBaseLots');
  source = source.replaceAll('quote.current - quote.previousClose', 'quote.current - reference.previousClose');

  const marker = '    private static Quote fetchQuote(String ticker) throws Exception {';
  if (!source.includes('private static MarketReference fetchTrustedMarketReference')) {
    const index = source.indexOf(marker);
    if (index < 0) throw new Error('worker trusted reference insertion marker missing');
    const helper = `    private static final Pattern FOREKS_CEILING = Pattern.compile("(?i)(?:^|\\\\s)Tavan\\\\s+([0-9][0-9.,]*)");
    private static final Pattern FOREKS_FLOOR = Pattern.compile("(?i)(?:^|\\\\s)Taban\\\\s+([0-9][0-9.,]*)");
    private static final Pattern FOREKS_PREVIOUS = Pattern.compile("(?i)Önceki\\\\s+G\\\\.?\\\\s*Kapanış\\\\s+([0-9][0-9.,]*)");

    private static MarketReference fetchTrustedMarketReference(String ticker) throws Exception {
        Exception firstError = null;
        try {
            String html = fetchText("https://webservice.foreks.com/foreks-web-widget/singlepage/" + ticker + "?lang=tr", MAX_RESPONSE_BYTES);
            MarketReference reference = parseForeksReference(stripHtml(html));
            if (reference != null) return reference;
        } catch (Exception error) {
            firstError = error;
        }
        try {
            String html = fetchText("https://www.oyakyatirim.com.tr/hisse-detay/" + ticker, MAX_RESPONSE_BYTES);
            MarketReference reference = parseOyakReference(stripHtml(html));
            if (reference != null) return reference;
        } catch (Exception error) {
            if (firstError != null) error.addSuppressed(firstError);
            throw error;
        }
        if (firstError != null) throw firstError;
        throw new IllegalStateException("Doğrulanmış piyasa referansı bulunamadı.");
    }

    private static MarketReference parseForeksReference(String text) {
        double ceiling = matchedMarketNumber(FOREKS_CEILING, text);
        double floor = matchedMarketNumber(FOREKS_FLOOR, text);
        double previous = matchedMarketNumber(FOREKS_PREVIOUS, text);
        return validReference(previous, floor, ceiling) ? new MarketReference(previous, floor, ceiling) : null;
    }

    private static MarketReference parseOyakReference(String text) {
        Pattern row = Pattern.compile("(?i)Taban\\\\s+Tavan\\\\s+Saat\\\\s+([0-9.,]+)\\\\s+[-+0-9.,]+\\\\s+%?[-+0-9.,]+\\\\s+([0-9.,]+)\\\\s+([0-9.,]+)\\\\s+([0-9.,]+)\\\\s+([0-9.,]+)\\\\s+\\\\d{1,2}:\\\\d{2}");
        Matcher rowMatch = row.matcher(text);
        double floor = Double.NaN;
        double ceiling = Double.NaN;
        if (rowMatch.find()) {
            floor = marketNumber(rowMatch.group(4));
            ceiling = marketNumber(rowMatch.group(5));
        }
        double previous = Double.NaN;
        Matcher markerMatch = Pattern.compile("(?i)Önceki\\\\s+Kapanış").matcher(text);
        if (markerMatch.find()) {
            String tail = text.substring(markerMatch.end());
            Matcher dailyMatch = Pattern.compile("(?i)\\\\bGünlük\\\\b").matcher(tail);
            if (dailyMatch.find()) {
                Matcher numbers = Pattern.compile("[0-9]+(?:[.,][0-9]+)*").matcher(tail.substring(dailyMatch.end()));
                int seen = 0;
                while (numbers.find()) {
                    seen += 1;
                    if (seen == 4) { previous = marketNumber(numbers.group()); break; }
                }
            }
        }
        return validReference(previous, floor, ceiling) ? new MarketReference(previous, floor, ceiling) : null;
    }

    private static double matchedMarketNumber(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? marketNumber(matcher.group(1)) : Double.NaN;
    }

    private static double marketNumber(String value) {
        if (value == null) return Double.NaN;
        String text = value.trim().replace(" ", "");
        if (text.contains(",")) text = text.replace(".", "").replace(',', '.');
        try { return Double.parseDouble(text.replaceAll("[^0-9.+-]", "")); }
        catch (Exception ignored) { return Double.NaN; }
    }

    private static boolean validReference(double previous, double floor, double ceiling) {
        return previous > 0 && floor > 0 && ceiling > floor
                && Double.isFinite(previous) && Double.isFinite(floor) && Double.isFinite(ceiling);
    }

`;
    source = source.slice(0, index) + helper + source.slice(index);
  }

  source = replaceOnce(source,
`    private static final class Quote {
`,
`    private static final class MarketReference {
        final double previousClose;
        final double floorPrice;
        final double ceilingPrice;

        MarketReference(double previousClose, double floorPrice, double ceilingPrice) {
            this.previousClose = previousClose;
            this.floorPrice = floorPrice;
            this.ceilingPrice = ceilingPrice;
        }
    }

    private static final class Quote {
`, 'worker MarketReference class');
  await write(path, source);
}

// Package the new runtime module and force a new cache generation.
{
  const path = 'public/sw.js';
  let source = await read(path);
  source = replaceOnce(source, "const CACHE = 'halka-arz-portfoy-v7';", "const CACHE = 'halka-arz-portfoy-v8';", 'service worker generation');
  source = replaceOnce(source,
    "'./core/http.js', './core/data-sources.js', './core/gedik-calendar.js', './core/parsers.js', './core/domain.js',",
    "'./core/http.js', './core/data-sources.js', './core/market-reference.js', './core/gedik-calendar.js', './core/parsers.js', './core/domain.js',",
    'service worker market reference asset');
  await write(path, source);
}

console.log('Applied trusted market-reference integration.');
