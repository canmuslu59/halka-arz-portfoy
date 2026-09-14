import { parseGedikCalendar } from '../public/core/gedik-calendar.js';
import { parseAhlatciCalendar } from '../public/core/parsers.js';

const GEDIK_URL = 'https://gedik.com/halka-arz-takvimi';
const AHLATCI_URL = 'https://www.ahlatciyatirim.com.tr/halka-arz?sayfa=1';

async function fetchText(url, fetchImpl) {
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(12_000) : undefined;
  const response = await fetchImpl(url, {
    signal,
    headers:{
      'user-agent':'Mozilla/5.0 (compatible; HalkaArzPortfoyum/2.4.6)',
      accept:'text/html,*/*',
      'accept-language':'tr-TR,tr;q=0.9,en;q=0.8',
    },
  });
  if (!response?.ok) throw new Error(`IPO calendar HTTP ${response?.status || 'unknown'}`);
  return response.text();
}

function cleanTicker(value) {
  return String(value || '').trim().toUpperCase().replace(/\.IS$/i, '').replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function usefulEntries(item) {
  return Object.fromEntries(Object.entries(item || {}).filter(([, value]) => value != null && value !== '' && (!Array.isArray(value) || value.length)));
}

export async function fetchCloudflareIpoCalendar({ fetchImpl = globalThis.fetch } = {}) {
  const [gedikResult, ahlatciResult] = await Promise.allSettled([
    fetchText(GEDIK_URL, fetchImpl).then(parseGedikCalendar),
    fetchText(AHLATCI_URL, fetchImpl).then(parseAhlatciCalendar),
  ]);

  if (gedikResult.status === 'rejected' && ahlatciResult.status === 'rejected') {
    throw new Error('Halka arz takvim kaynaklarına ulaşılamadı.');
  }

  const byTicker = new Map();
  const ahlatci = ahlatciResult.status === 'fulfilled' ? ahlatciResult.value : [];
  const gedik = gedikResult.status === 'fulfilled' ? gedikResult.value : [];

  for (const item of ahlatci) {
    const ticker = cleanTicker(item?.ticker);
    if (!ticker) continue;
    byTicker.set(ticker, { ...item, ticker, sources:['Ahlatcı Yatırım'] });
  }
  for (const item of gedik) {
    const ticker = cleanTicker(item?.ticker);
    if (!ticker) continue;
    const fallback = byTicker.get(ticker);
    byTicker.set(ticker, {
      ...(fallback || {}),
      ...usefulEntries(item),
      ticker,
      sources:fallback ? ['Gedik Yatırım','Ahlatcı Yatırım'] : ['Gedik Yatırım'],
    });
  }

  return [...byTicker.values()];
}
