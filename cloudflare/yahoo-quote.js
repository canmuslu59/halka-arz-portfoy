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

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close)
    ? result.indicators.quote[0].close
    : [];

  let latestTickEpoch = 0;
  let latestTickClose = null;
  const count = Math.min(timestamps.length, closes.length);
  for (let index = 0; index < count; index += 1) {
    const epoch = Number(timestamps[index]);
    const close = finiteNumber(closes[index]);
    if (!(epoch > 0) || !(close > 0)) continue;
    if (epoch > latestTickEpoch) {
      latestTickEpoch = epoch;
      latestTickClose = close;
    }
  }

  const metaMarketEpoch = finiteNumber(meta.regularMarketTime) ?? 0;
  const effectiveMarketEpoch = Math.max(metaMarketEpoch, latestTickEpoch);
  const latestMarketDate = effectiveMarketEpoch > 0
    ? dateInIstanbul(new Date(effectiveMarketEpoch * 1000))
    : null;

  let current = finiteNumber(meta.regularMarketPrice);
  if (latestTickEpoch > metaMarketEpoch) current = latestTickClose;
  if (!(current > 0)) current = latestTickClose;

  let previousSessionEpoch = 0;
  let previousSessionClose = null;
  if (latestMarketDate) {
    for (let index = 0; index < count; index += 1) {
      const epoch = Number(timestamps[index]);
      const close = finiteNumber(closes[index]);
      if (!(epoch > 0) || !(close > 0)) continue;
      if (dateInIstanbul(new Date(epoch * 1000)) >= latestMarketDate) continue;
      if (epoch > previousSessionEpoch) {
        previousSessionEpoch = epoch;
        previousSessionClose = close;
      }
    }
  }

  let previousClose = finiteNumber(meta.previousClose);
  if (!(previousClose > 0)) previousClose = previousSessionClose;
  if (!(previousClose > 0)) previousClose = finiteNumber(meta.chartPreviousClose);

  return {
    ticker:key,
    current:current > 0 ? current : null,
    previousClose:previousClose > 0 ? previousClose : null,
    latestMarketDate,
  };
}
