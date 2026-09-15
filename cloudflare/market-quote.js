import { fetchYahooQuote } from './yahoo-quote.js';
import { parseForeksReferenceText, parseOyakReferenceText, applyTrustedMarketReference } from '../public/core/market-reference.js';

const referenceCache = new Map();
const REFERENCE_TTL_MS = 10 * 60 * 1000;

function keyOf(value) {
  return String(value || '').trim().toUpperCase().replace(/\.IS$/i, '').replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

async function fetchText(url, fetchImpl) {
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(12_000) : undefined;
  const response = await fetchImpl(url, {
    signal,
    headers:{ 'user-agent':'Mozilla/5.0 Chrome/154 Safari/537.36', accept:'text/html,text/plain,*/*', 'accept-language':'tr-TR,tr;q=0.9,en;q=0.8' },
  });
  if (!response?.ok) throw new Error(`Reference HTTP ${response?.status || 'unknown'}`);
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
      await fetchText(`https://webservice.foreks.com/foreks-web-widget/singlepage/${encodeURIComponent(key)}?lang=tr`, fetchImpl),
      key,
    );
  } catch {}
  if (!reference) {
    try {
      reference = parseOyakReferenceText(
        await fetchText(`https://www.oyakyatirim.com.tr/hisse-detay/${encodeURIComponent(key)}`, fetchImpl),
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
