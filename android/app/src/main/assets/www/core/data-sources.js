import { cleanTicker } from './domain.js';
import { parseYahooChart, parseAhlatciList, parseAhlatciDetail, parseFintablesSector } from './parsers.js';

export function createDataSources({ getJson, getText }) {
  if (typeof getJson !== 'function' || typeof getText !== 'function') {
    throw new TypeError('HTTP veri fonksiyonları gerekli.');
  }

  async function getQuote(ticker) {
    const key = cleanTicker(ticker);
    if (!key) throw new Error('Geçerli bir hisse kodu girin.');
    const symbol = `${key}.IS`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=5m&includePrePost=false&events=div%2Csplits`;
    return parseYahooChart(await getJson(url), key);
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
    try {
      const firstPage = await getText('https://www.ahlatciyatirim.com.tr/halka-arz?sayfa=1');
      found = parseAhlatciList(firstPage, key);
    } catch {
      // Continue with archive pages; a single page failure must not block lookup.
    }

    if (!found) {
      const pages = await Promise.allSettled(
        Array.from({ length: 11 }, (_, index) => getText(`https://www.ahlatciyatirim.com.tr/halka-arz?sayfa=${index + 2}`)),
      );
      for (const page of pages) {
        if (page.status !== 'fulfilled') continue;
        found = parseAhlatciList(page.value, key);
        if (found) break;
      }
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

  return { getQuote, getMarket:getQuote, getHistory, getIpo, getSector };
}
