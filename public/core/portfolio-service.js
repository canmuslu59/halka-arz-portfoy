import {
  cleanTicker,
  cleanSectorName,
  canonicalSectorName,
  isGenericSectorName,
  inferSectorFromCompany,
  calculateHolding,
  calculateTotals,
  makePortfolioHistory,
  validateSale,
} from './domain.js';

const QUOTE_TTL_MS = 12_000;

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nullableFiniteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function optionalIsoDate(value, label = 'Tarih') {
  if (value == null || value === '') return null;
  const text = String(value);
  if (!isValidIsoDate(text)) throw new Error(`${label} geçerli bir YYYY-AA-GG tarihi olmalı.`);
  return text;
}

function messageOf(reason, fallback) {
  return reason?.message || String(reason || fallback);
}

function snapshotAge(nowDate, snapshot) {
  const stamp = snapshot?.fetchedAt ? new Date(snapshot.fetchedAt).getTime() : NaN;
  return Number.isFinite(stamp) ? nowDate.getTime() - stamp : Infinity;
}

function mergeHistoryRows(
  baseRows = [],
  recentRows = [],
  { latestMarketDate = null, today = null, previousClose = null } = {},
) {
  const byDate = new Map();
  for (const row of baseRows) {
    const close = nullableFiniteNumber(row?.close);
    if (!row?.date || close == null) continue;
    byDate.set(row.date, { ...row, close });
  }

  const validRecentRows = recentRows
    .map(row => ({ row, close: nullableFiniteNumber(row?.close) }))
    .filter(({ row, close }) => row?.date && close != null)
    .map(({ row, close }) => ({ ...row, close }));
  const priorRecentDate = latestMarketDate
    ? validRecentRows.filter(row => row.date < latestMarketDate).map(row => row.date).sort().at(-1) || null
    : null;
  const exchangePreviousClose = nullableFiniteNumber(previousClose);

  for (const row of validRecentRows) {
    const hasDailyRow = byDate.has(row.date);
    const isCurrentLiveSession = row.date === latestMarketDate && latestMarketDate === today;

    // Finalized daily rows are immutable. The 5-minute feed may only replace the
    // live session for today's market date, or backfill a date missing entirely
    // from the daily feed. This keeps Friday stable throughout the weekend and
    // prevents Monday refreshes from revising Friday retrospectively.
    if (hasDailyRow && !isCurrentLiveSession) continue;

    let close = row.close;
    // Yahoo's daily feed can temporarily omit the immediately previous session.
    // In that case its quote metadata previousClose is the exchange-session close
    // and is more accurate than the final 5-minute candle (which can miss the
    // closing auction). Use it only when the daily row is actually absent.
    if (!hasDailyRow && row.date === priorRecentDate && exchangePreviousClose != null) {
      close = exchangePreviousClose;
    }
    byDate.set(row.date, { ...row, close });
  }
  return [...byDate.values()].sort((a,b) => a.date.localeCompare(b.date));
}


function chooseSector({ manual = null, remote = null, remoteSource = null, inferred = null } = {}) {
  const manualSector = cleanSectorName(manual);
  if (manualSector) return { sector: manualSector, source: 'Elle' };
  const remoteSector = canonicalSectorName(remote);
  const inferredSector = cleanSectorName(inferred);
  if (inferredSector && (!remoteSector || isGenericSectorName(remoteSector))) {
    return { sector: inferredSector, source: 'Otomatik sınıflandırma' };
  }
  if (remoteSector) return { sector: remoteSector, source: remoteSource || null };
  if (inferredSector) return { sector: inferredSector, source: 'Otomatik sınıflandırma' };
  return { sector: null, source: null };
}

function normalizedSectorSnapshot(sectorResult, inferredSector, stamp) {
  const chosen = chooseSector({
    remote: sectorResult?.sector,
    remoteSource: sectorResult?.source,
    inferred: inferredSector,
  });
  return {
    ...(sectorResult || {}),
    sector: chosen.sector,
    source: chosen.source,
    fetchedAt: stamp,
  };
}
function dateInIstanbul(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Istanbul', year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(date);
  const pick = type => parts.find(part => part.type === type)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export function createPortfolioService({
  repository,
  getQuote,
  getMarket,
  getHistory,
  getIpo,
  getSector,
  now = () => new Date(),
  uuid = () => crypto.randomUUID(),
}) {
  if (!repository || typeof repository.load !== 'function' || typeof repository.save !== 'function') {
    throw new TypeError('Portfolio repository gerekli.');
  }
  const quoteFn = getQuote || getMarket;
  const historyFn = getHistory || (async ticker => quoteFn(ticker));
  const sectorFn = getSector || (async ticker => ({ ticker, sector:null, source:null }));
  if (typeof quoteFn !== 'function' || typeof getIpo !== 'function' || typeof historyFn !== 'function') {
    throw new TypeError('Market ve halka arz veri fonksiyonları gerekli.');
  }


let operationQueue = Promise.resolve();
function serialize(task) {
  const run = operationQueue.then(task, task);
  operationQueue = run.then(() => undefined, () => undefined);
  return run;
}

function hydrate(raw, errors = {}) {
    const ipo = raw.ipoSnapshot || {};
    const legacyMarket = raw.marketSnapshot || {};
    const quote = raw.quoteSnapshot || legacyMarket;
    const historySnapshot = raw.historySnapshot || {};
    const sectorSnapshot = raw.sectorSnapshot || {};
    const ipoPrice = positiveNumber(raw.ipoPriceOverride) ?? positiveNumber(ipo.ipoPrice);
    const firstTradeDate = raw.firstTradeDateOverride || ipo.firstTradeDate || null;
    const baseHistory = Array.isArray(historySnapshot.history)
      ? historySnapshot.history
      : Array.isArray(legacyMarket.history)
        ? legacyMarket.history
        : [];
    const quoteHistory = Array.isArray(quote.history) ? quote.history : [];
    const quoteLatestMarketDate = quote.latestMarketDate || quoteHistory.at(-1)?.date || null;
    const today = dateInIstanbul(now());
    const quotePreviousClose = nullableFiniteNumber(quote.previousClose);
    const history = mergeHistoryRows(baseHistory, quoteHistory, {
      latestMarketDate: quoteLatestMarketDate,
      today,
      previousClose: quotePreviousClose,
    });
    const latestMarketDate = quoteLatestMarketDate || history.at(-1)?.date || null;
    const inferredSector = inferSectorFromCompany(ipo.company, raw.ticker);
    const chosenSector = chooseSector({
      manual: raw.sectorOverride,
      remote: sectorSnapshot.sector,
      remoteSource: sectorSnapshot.source,
      inferred: inferredSector,
    });
    return calculateHolding({
      ...raw,
      company: ipo.company || null,
      source: ipo.source || null,
      ipoPrice,
      firstTradeDate,
      offerDates: ipo.offerDates || null,
      sector: chosenSector.sector,
      sectorSource: chosenSector.source,
      currentPrice: nullableFiniteNumber(quote.current),
      previousClose: quotePreviousClose,
      latestMarketDate,
      marketTime: quote.marketTime || null,
      history,
      errors: {
        market: errors.market || null,
        history: errors.history || null,
        ipo: errors.ipo || (ipoPrice == null ? 'Halka arz fiyatı otomatik bulunamadı.' : null),
        sector: errors.sector || null,
      },
    }, { today });
  }

  function portfolioFrom(data, errorsById = new Map()) {
    const nowDate = now();
    const today = dateInIstanbul(nowDate);
    const holdings = (data.holdings || []).map(raw => hydrate(raw, errorsById.get(raw.id) || {}));
    const totals = calculateTotals(holdings);
    const history = makePortfolioHistory(holdings);
    const lastHistory = history.at(-1);
    if (lastHistory?.date === today) {
      lastHistory.dailyProfit = totals.dailyProfit;
      lastHistory.dailyPct = totals.dailyPct;
    }
    const activeMarketTimes = holdings
      .filter(holding => Number(holding.currentLots || 0) > 0 && holding.marketTime)
      .map(holding => new Date(holding.marketTime).getTime())
      .filter(Number.isFinite);
    const oldestMarketTimeMs = activeMarketTimes.length ? Math.min(...activeMarketTimes) : null;
    return {
      holdings,
      totals,
      history,
      marketDataTime: oldestMarketTimeMs == null ? null : new Date(oldestMarketTimeMs).toISOString(),
      marketDataAgeMs: oldestMarketTimeMs == null ? null : Math.max(0, nowDate.getTime() - oldestMarketTimeMs),
      updatedAt: nowDate.toISOString(),
    };
  }

  async function refreshQuoteRaw(raw, { force = false } = {}) {
    const nowDate = now();
    const existing = raw.quoteSnapshot || raw.marketSnapshot;
    if (!force && snapshotAge(nowDate, existing) < QUOTE_TTL_MS) return { raw, errors:{} };
    try {
      const quote = await quoteFn(raw.ticker);
      return { raw:{ ...raw, quoteSnapshot:{ ...quote, fetchedAt:nowDate.toISOString() } }, errors:{} };
    } catch (error) {
      return { raw, errors:{ market:messageOf(error, 'Fiyat verisi alınamadı.') } };
    }
  }

  async function getPortfolio({ refresh = true, force = false } = {}) {
    const data = await repository.load();
    if (!refresh || !data.holdings.length) return portfolioFrom(data);
    const refreshed = await Promise.all(data.holdings.map(raw => refreshQuoteRaw(raw, { force })));
    data.holdings = refreshed.map(item => item.raw);
    await repository.save(data);
    const errorsById = new Map(refreshed.map(item => [item.raw.id, item.errors]));
    return portfolioFrom(data, errorsById);
  }

  async function refreshHistory({ force = false } = {}) {
    const data = await repository.load();
    const localDate = dateInIstanbul(now());
    const errorsById = new Map();
    const next = await Promise.all(data.holdings.map(async raw => {
      let nextRaw = { ...raw };
      const rowErrors = {};

      const ipo = nextRaw.ipoSnapshot || {};
      const inferredSector = inferSectorFromCompany(ipo.company, nextRaw.ticker);
      const cachedSector = canonicalSectorName(nextRaw.sectorSnapshot?.sector);
      const cachedIsTooGeneric = Boolean(inferredSector && cachedSector && isGenericSectorName(cachedSector));
      if (!nextRaw.sectorOverride && (!cachedSector || cachedIsTooGeneric)) {
        try {
          const sector = await sectorFn(nextRaw.ticker);
          nextRaw.sectorSnapshot = normalizedSectorSnapshot(sector, inferredSector, now().toISOString());
        } catch (error) {
          if (inferredSector) {
            nextRaw.sectorSnapshot = normalizedSectorSnapshot({ ticker:nextRaw.ticker, sector:null, source:null }, inferredSector, now().toISOString());
          } else {
            rowErrors.sector = messageOf(error, 'Sektör verisi alınamadı.');
          }
        }
      }

      const firstTradeDate = nextRaw.firstTradeDateOverride || ipo.firstTradeDate || null;
      if (firstTradeDate) {
        const historyIsFresh = !force
          && nextRaw.historySnapshot?.fetchedLocalDate === localDate
          && nextRaw.historySnapshot?.startDate === firstTradeDate
          && Array.isArray(nextRaw.historySnapshot?.history);
        if (!historyIsFresh) {
          try {
            const result = await historyFn(nextRaw.ticker, firstTradeDate);
            nextRaw.historySnapshot = {
              history:Array.isArray(result.history) ? result.history : [],
              fetchedAt:now().toISOString(),
              fetchedLocalDate:localDate,
              startDate:firstTradeDate,
            };
          } catch (error) {
            rowErrors.history = messageOf(error, 'Geçmiş fiyat verisi alınamadı.');
          }
        }
      }

      if (Object.keys(rowErrors).length) errorsById.set(nextRaw.id, rowErrors);
      return nextRaw;
    }));
    data.holdings = next;
    await repository.save(data);
    return portfolioFrom(data, errorsById);
  }

  async function lookup(ticker) {
    const key = cleanTicker(ticker);
    if (!key) throw new Error('Geçerli bir hisse kodu girin.');
    const [market, ipo] = await Promise.allSettled([quoteFn(key), getIpo(key)]);
    return {
      ticker: key,
      market: market.status === 'fulfilled' ? market.value : null,
      ipo: ipo.status === 'fulfilled' ? ipo.value : null,
      warnings: [
        market.status === 'rejected' ? messageOf(market.reason, 'Fiyat verisi alınamadı.') : null,
        ipo.status === 'rejected' ? messageOf(ipo.reason, 'Halka arz verisi alınamadı.') : null,
      ].filter(Boolean),
    };
  }

  async function addHolding({ ticker, lots, ipoPriceOverride = null, firstTradeDateOverride = null }) {
    const key = cleanTicker(ticker);
    const lotCount = Number(lots);
    if (!key || !Number.isInteger(lotCount) || lotCount <= 0) {
      throw new Error('Hisse kodu ve 0’dan büyük tam lot sayısı gerekli.');
    }
    const normalizedFirstTradeDateOverride = optionalIsoDate(firstTradeDateOverride, 'İlk işlem tarihi');
    if (normalizedFirstTradeDateOverride && normalizedFirstTradeDateOverride > dateInIstanbul(now())) {
      throw new Error('İlk işlem tarihi gelecekte olamaz.');
    }
    const data = await repository.load();
    if (data.holdings.some(item => cleanTicker(item.ticker) === key)) throw new Error(`${key} zaten portföyde.`);

    const [quoteResult, ipoResult, sectorResult] = await Promise.allSettled([quoteFn(key), getIpo(key), sectorFn(key)]);
    if (quoteResult.status !== 'fulfilled') throw new Error(`${key} için BIST fiyat verisi bulunamadı. Kod doğru mu?`);
    const stamp = now().toISOString();
    const localDate = dateInIstanbul(now());
    const ipoData = ipoResult.status === 'fulfilled' ? ipoResult.value : null;
    const firstTradeDate = normalizedFirstTradeDateOverride || ipoData?.firstTradeDate || null;
    let historyResult = null;
    let historyError = null;
    if (firstTradeDate) {
      try { historyResult = await historyFn(key, firstTradeDate); }
      catch (error) { historyError = messageOf(error, 'Geçmiş fiyat verisi alınamadı.'); }
    }
    const raw = {
      id: uuid(),
      ticker: key,
      initialLots: lotCount,
      currentLots: lotCount,
      addedAt: stamp,
      ipoPriceOverride: positiveNumber(ipoPriceOverride),
      firstTradeDateOverride: normalizedFirstTradeDateOverride,
      sectorOverride: null,
      sales: [],
      quoteSnapshot: { ...quoteResult.value, fetchedAt: stamp },
      historySnapshot: firstTradeDate ? {
        history:Array.isArray(historyResult?.history) ? historyResult.history : (quoteResult.value.history || []),
        fetchedAt:stamp,
        fetchedLocalDate:localDate,
        startDate:firstTradeDate,
      } : null,
      ipoSnapshot: ipoData ? { ...ipoData, fetchedAt: stamp } : null,
      sectorSnapshot: sectorResult.status === 'fulfilled' ? normalizedSectorSnapshot(sectorResult.value, inferSectorFromCompany(ipoData?.company, key), stamp) : normalizedSectorSnapshot({ ticker:key, sector:null, source:null }, inferSectorFromCompany(ipoData?.company, key), stamp),
    };
    data.holdings.push(raw);
    await repository.save(data);
    return {
      holding: hydrate(raw, {
        ipo: ipoResult.status === 'rejected' ? messageOf(ipoResult.reason, 'Halka arz verisi alınamadı.') : null,
        sector: sectorResult.status === 'rejected' ? messageOf(sectorResult.reason, 'Sektör verisi alınamadı.') : null,
        history: historyError,
      }),
      autoIpoFound: Boolean(ipoResult.status === 'fulfilled' && positiveNumber(ipoResult.value?.ipoPrice)),
    };
  }

  async function updateHolding(id, patch = {}) {
    const data = await repository.load();
    const index = data.holdings.findIndex(item => item.id === id);
    if (index < 0) throw new Error('Kayıt bulunamadı.');
    const raw = { ...data.holdings[index] };
    if (patch.ipoPriceOverride === null || positiveNumber(patch.ipoPriceOverride)) {
      raw.ipoPriceOverride = patch.ipoPriceOverride === null ? null : Number(patch.ipoPriceOverride);
    }
    if (typeof patch.firstTradeDateOverride === 'string' || patch.firstTradeDateOverride === null) {
      raw.firstTradeDateOverride = optionalIsoDate(patch.firstTradeDateOverride, 'İlk işlem tarihi');
      if (raw.firstTradeDateOverride && raw.firstTradeDateOverride > dateInIstanbul(now())) {
        throw new Error('İlk işlem tarihi gelecekte olamaz.');
      }
      const effectiveFirstTradeDate = raw.firstTradeDateOverride || raw.ipoSnapshot?.firstTradeDate || null;
      if (effectiveFirstTradeDate && (raw.sales || []).some(sale => sale?.date && sale.date < effectiveFirstTradeDate)) {
        throw new Error('İlk işlem tarihi mevcut bir satış tarihinden sonra olamaz.');
      }
    }
    if (typeof patch.sectorOverride === 'string' || patch.sectorOverride === null) {
      raw.sectorOverride = patch.sectorOverride?.trim() || null;
    }
    data.holdings[index] = raw;
    await repository.save(data);
    return hydrate(raw);
  }

  async function addSale(id, { lots, price, date } = {}) {
    const data = await repository.load();
    const index = data.holdings.findIndex(item => item.id === id);
    if (index < 0) throw new Error('Kayıt bulunamadı.');
    const raw = { ...data.holdings[index], sales: [...(data.holdings[index].sales || [])] };
    const valid = validateSale(raw, lots, price);
    const saleDate = optionalIsoDate(date || dateInIstanbul(now()), 'Satış tarihi');
    if (saleDate > dateInIstanbul(now())) throw new Error('Satış tarihi gelecekte olamaz.');
    const firstTradeDate = raw.firstTradeDateOverride || raw.ipoSnapshot?.firstTradeDate || null;
    if (firstTradeDate && saleDate < firstTradeDate) throw new Error('Satış tarihi ilk işlem tarihinden önce olamaz.');
    const stamp = now().toISOString();
    raw.sales.push({
      id: uuid(),
      lots: valid.lots,
      price: valid.price,
      date: saleDate,
      createdAt: stamp,
    });
    raw.currentLots = Number(raw.currentLots || 0) - valid.lots;
    data.holdings[index] = raw;
    await repository.save(data);
    return hydrate(raw);
  }

  async function deleteHolding(id) {
    const data = await repository.load();
    const before = data.holdings.length;
    data.holdings = data.holdings.filter(item => item.id !== id);
    if (data.holdings.length === before) throw new Error('Kayıt bulunamadı.');
    await repository.save(data);
    return { ok: true };
  }

  async function refreshHolding(id) {
    const data = await repository.load();
    const index = data.holdings.findIndex(item => item.id === id);
    if (index < 0) throw new Error('Kayıt bulunamadı.');
    const original = data.holdings[index];
    const [quoteResult, ipoResult, sectorResult] = await Promise.allSettled([
      quoteFn(original.ticker), getIpo(original.ticker), sectorFn(original.ticker),
    ]);
    let raw = { ...original };
    const errors = {};
    const stamp = now().toISOString();
    if (quoteResult.status === 'fulfilled') raw.quoteSnapshot = { ...quoteResult.value, fetchedAt:stamp };
    else errors.market = messageOf(quoteResult.reason, 'Fiyat verisi alınamadı.');
    if (ipoResult.status === 'fulfilled') raw.ipoSnapshot = { ...ipoResult.value, fetchedAt:stamp };
    else errors.ipo = messageOf(ipoResult.reason, 'Halka arz verisi alınamadı.');
    if (sectorResult.status === 'fulfilled') {
      raw.sectorSnapshot = normalizedSectorSnapshot(sectorResult.value, inferSectorFromCompany(raw.ipoSnapshot?.company, raw.ticker), stamp);
    } else {
      const inferredSector = inferSectorFromCompany(raw.ipoSnapshot?.company, raw.ticker);
      if (inferredSector) raw.sectorSnapshot = normalizedSectorSnapshot({ ticker:raw.ticker, sector:null, source:null }, inferredSector, stamp);
      else errors.sector = messageOf(sectorResult.reason, 'Sektör verisi alınamadı.');
    }
    const firstTradeDate = raw.firstTradeDateOverride || raw.ipoSnapshot?.firstTradeDate || null;
    if (firstTradeDate) {
      try {
        const hist = await historyFn(raw.ticker, firstTradeDate);
        raw.historySnapshot = {
          history:Array.isArray(hist.history) ? hist.history : [], fetchedAt:stamp,
          fetchedLocalDate:dateInIstanbul(now()), startDate:firstTradeDate,
        };
      } catch (error) { errors.history = messageOf(error, 'Geçmiş fiyat verisi alınamadı.'); }
    }
    data.holdings[index] = raw;
    await repository.save(data);
    return hydrate(raw, errors);
  }

  return {
  lookup,
  getPortfolio: (...args) => serialize(() => getPortfolio(...args)),
  refreshHistory: (...args) => serialize(() => refreshHistory(...args)),
  addHolding: (...args) => serialize(() => addHolding(...args)),
  updateHolding: (...args) => serialize(() => updateHolding(...args)),
  addSale: (...args) => serialize(() => addSale(...args)),
  deleteHolding: (...args) => serialize(() => deleteHolding(...args)),
  refreshHolding: (...args) => serialize(() => refreshHolding(...args)),
};
}
