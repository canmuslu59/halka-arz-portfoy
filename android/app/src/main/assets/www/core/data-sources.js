import { cleanTicker } from './domain.js';
import { parseYahooChart, parseAhlatciList, parseAhlatciDetail } from './parsers.js';

export function createDataSources({ getJson, getText }) {
  if (typeof getJson !== 'function' || typeof getText !== 'function') {
    throw new TypeError('HTTP veri fonksiyonları gerekli.');
  }

  async function getMarket(ticker) {
    const key = cleanTicker(ticker);
    if (!key) throw new Error('Geçerli bir hisse kodu girin.');
    const symbol = `${key}.IS`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&includePrePost=false&events=div%2Csplits`;
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

  return { getMarket, getIpo };
}
