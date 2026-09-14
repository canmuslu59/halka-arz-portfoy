function cleanTicker(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function dateInIstanbul(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Istanbul',
    year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export async function fetchYahooQuote(ticker, { fetchImpl = globalThis.fetch } = {}) {
  const key = cleanTicker(ticker);
  if (!key) return null;
  const symbol = `${key}.IS`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1m&includePrePost=false&events=div%2Csplits`;
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(12_000) : undefined;
  const response = await fetchImpl(url, {
    signal,
    headers:{
      'user-agent':'Mozilla/5.0 Chrome/154 Safari/537.36',
      accept:'application/json,text/plain,*/*',
    },
  });
  if (!response?.ok) throw new Error(`Yahoo HTTP ${response?.status || 'unknown'}`);
  const json = await response.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta || {};
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const current = Number(meta.regularMarketPrice);
  const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose);
  const lastTimestamp = Number(meta.regularMarketTime || timestamps.at(-1));
  const latestMarketDate = Number.isFinite(lastTimestamp) && lastTimestamp > 0
    ? dateInIstanbul(new Date(lastTimestamp * 1000))
    : null;
  return {
    ticker:key,
    current:Number.isFinite(current) ? current : null,
    previousClose:Number.isFinite(previousClose) ? previousClose : null,
    latestMarketDate,
  };
}
