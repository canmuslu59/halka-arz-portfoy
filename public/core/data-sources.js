import { cleanTicker } from './domain.js';
import { parseYahooChart, parseAhlatciList, parseAhlatciDetail, parseAhlatciCalendar, parseFintablesSector } from './parsers.js';
import { parseGedikCalendar } from './gedik-calendar.js';
import { parseForeksReferenceText, parseOyakReferenceText, applyTrustedMarketReference } from './market-reference.js';

const MAX_AHLATCI_ARCHIVE_PAGES = 40;

function ahlatciPageUrl(pageNumber) {
  return `https://www.ahlatciyatirim.com.tr/halka-arz?sayfa=${pageNumber}`;
}

function hasNextAhlatciPage(html, pageNumber) {
  const nextPage = pageNumber + 1;
  const text = String(html || '');
  const escaped = String(nextPage).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:[?&]|&amp;)sayfa=${escaped}(?:["'&<\\s]|$)`, 'i').test(text);
}

export function createDataSources({ getJson, getText }) {
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
      const text = await getText(`https://webservice.foreks.com/foreks-web-widget/singlepage/${encodeURIComponent(key)}?lang=tr`);
      reference = parseForeksReferenceText(text, key);
    } catch {}
    if (!reference) {
      try {
        const text = await getText(`https://www.oyakyatirim.com.tr/hisse-detay/${encodeURIComponent(key)}`);
        reference = parseOyakReferenceText(text, key);
      } catch {}
    }
    referenceCache.set(key, { value:reference, expiresAt:Date.now() + REFERENCE_TTL_MS });
    return reference;
  }

  async function getQuote(ticker) {
    const key = cleanTicker(ticker);
    if (!key) throw new Error('Geçerli bir hisse kodu girin.');
    const symbol = `${key}.IS`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=5m&includePrePost=false&events=div%2Csplits`;
    const [json, reference] = await Promise.all([
      getJson(url),
      getTrustedReference(key).catch(() => null),
    ]);
    return applyTrustedMarketReference(parseYahooChart(json, key), reference);
  }

  async function getHistory(ticker, startDate) {
    const key = cleanTicker(ticker);
    if (!key) throw new Error('Geçerli bir hisse kodu girin.');
    const startMs = Date.parse(`${startDate || '2010-01-01'}T00:00:00Z`);
    const period1 = Math.floor((Number.isFinite(startMs) ? startMs : Date.parse('2010-01-01T00:00:00Z')) / 1000) - 86400;
    const period2 = Math.floor(Date.now() / 1000) + 86400;
    const symbol = `${key}.IS`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&includePrePost=false&events=div%2Csplits`;
    return parseYahooChart(await getJson(url), key);
  }

  async function getIpo(ticker) {
    const key = cleanTicker(ticker);
    if (!key) throw new Error('Geçerli bir hisse kodu girin.');
    let found = null;
    let scanIncomplete = false;
    let firstPageHtml = '';
    try {
      firstPageHtml = await getText(ahlatciPageUrl(1));
      found = parseAhlatciList(firstPageHtml, key);
    } catch {
      scanIncomplete = true;
    }

    if (!found) {
      let pageNumber = 2;
      let shouldContinue = !firstPageHtml || hasNextAhlatciPage(firstPageHtml, 1);
      let previousPage = firstPageHtml;
      while (shouldContinue && pageNumber <= MAX_AHLATCI_ARCHIVE_PAGES && !found) {
        let html;
        try {
          html = await getText(ahlatciPageUrl(pageNumber));
        } catch {
          scanIncomplete = true;
          break;
        }
        const newResults = html && html !== previousPage;
        if (!newResults) break;
        found = parseAhlatciList(html, key);
        if (found) break;
        shouldContinue = hasNextAhlatciPage(html, pageNumber);
        previousPage = html;
        pageNumber += 1;
      }
      if (shouldContinue && pageNumber > MAX_AHLATCI_ARCHIVE_PAGES) scanIncomplete = true;
    }

    if (!found && scanIncomplete) {
      throw new Error('Halka arz arşivi eksik tarandı; veri kaynağına tam ulaşılamadı.');
    }

    if (found?.detailUrl) {
      try {
        found = parseAhlatciDetail(await getText(found.detailUrl), found);
      } catch {
        // List-level IPO data remains usable even if the detail request fails.
      }
    }

    return found || {
      ticker: key,
      company: null,
      ipoPrice: null,
      firstTradeDate: null,
      offerDates: null,
      source: null,
    };
  }

  async function getIpoCalendar() {
    const [gedikResult, ahlatciResult] = await Promise.allSettled([
      getText('https://gedik.com/halka-arz-takvimi').then(parseGedikCalendar),
      getText(ahlatciPageUrl(1)).then(parseAhlatciCalendar),
    ]);

    if (gedikResult.status === 'rejected' && ahlatciResult.status === 'rejected') {
      throw new Error('Halka arz takvim kaynaklarına ulaşılamadı.');
    }

    const gedikItems = gedikResult.status === 'fulfilled' ? gedikResult.value : [];
    const ahlatciItems = ahlatciResult.status === 'fulfilled' ? ahlatciResult.value : [];
    const byTicker = new Map();

    for (const item of ahlatciItems) {
      const ticker = cleanTicker(item?.ticker);
      if (!ticker) continue;
      byTicker.set(ticker, {
        ...item,
        ticker,
        sources: ['Ahlatcı Yatırım'],
      });
    }

    for (const item of gedikItems) {
      const ticker = cleanTicker(item?.ticker);
      if (!ticker) continue;
      const fallback = byTicker.get(ticker);
      byTicker.set(ticker, {
        ...(fallback || {}),
        ...Object.fromEntries(Object.entries(item || {}).filter(([, value]) => value != null && value !== '' && (!Array.isArray(value) || value.length))),
        ticker,
        source: item.source || fallback?.source || null,
        sources: fallback ? ['Gedik Yatırım', 'Ahlatcı Yatırım'] : ['Gedik Yatırım'],
      });
    }

    return [...byTicker.values()];
  }

  async function getIpoDetail(itemOrTicker) {
    const item = itemOrTicker && typeof itemOrTicker === 'object'
      ? { ...itemOrTicker, ticker:cleanTicker(itemOrTicker.ticker) }
      : { ticker:cleanTicker(itemOrTicker) };
    if (!item.ticker) throw new Error('Geçerli bir halka arz kodu girin.');
    if (item.detailUrl) {
      const html = await getText(item.detailUrl);
      return parseAhlatciDetail(html, item);
    }
    return getIpo(item.ticker);
  }

  async function getSector(ticker) {
    const key = cleanTicker(ticker);
    if (!key) throw new Error('Geçerli bir hisse kodu girin.');
    try {
      const html = await getText(`https://fintables.com/sirketler/${encodeURIComponent(key)}`);
      return parseFintablesSector(html, key);
    } catch {
      return { ticker:key, sector:null, source:null };
    }
  }

  return { getQuote, getMarket:getQuote, getHistory, getIpo, getIpoCalendar, getIpoDetail, getSector };
}