import {
  cleanTicker,
  calculateHolding,
  calculateTotals,
  makePortfolioHistory,
  validateSale,
} from './domain.js';

const MARKET_TTL_MS = 45_000;
const IPO_TTL_MS = 6 * 60 * 60 * 1000;

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function messageOf(reason, fallback) {
  return reason?.message || String(reason || fallback);
}

function snapshotAge(nowDate, snapshot) {
  const stamp = snapshot?.fetchedAt ? new Date(snapshot.fetchedAt).getTime() : NaN;
  return Number.isFinite(stamp) ? nowDate.getTime() - stamp : Infinity;
}

export function createPortfolioService({ repository, getMarket, getIpo, now = () => new Date(), uuid = () => crypto.randomUUID() }) {
  if (!repository || typeof repository.load !== 'function' || typeof repository.save !== 'function') {
    throw new TypeError('Portfolio repository gerekli.');
  }
  if (typeof getMarket !== 'function' || typeof getIpo !== 'function') {
    throw new TypeError('Market ve halka arz veri fonksiyonları gerekli.');
  }

  function hydrate(raw, errors = {}) {
    const ipo = raw.ipoSnapshot || {};
    const market = raw.marketSnapshot || {};
    const ipoPrice = positiveNumber(raw.ipoPriceOverride) ?? positiveNumber(ipo.ipoPrice);
    const firstTradeDate = raw.firstTradeDateOverride || ipo.firstTradeDate || null;
    return calculateHolding({
      ...raw,
      company: ipo.company || null,
      source: ipo.source || null,
      ipoPrice,
      firstTradeDate,
      offerDates: ipo.offerDates || null,
      currentPrice: Number.isFinite(Number(market.current)) ? Number(market.current) : null,
      previousClose: Number.isFinite(Number(market.previousClose)) ? Number(market.previousClose) : null,
      marketTime: market.marketTime || null,
      history: Array.isArray(market.history) ? market.history : [],
      errors: {
        market: errors.market || null,
        ipo: errors.ipo || (ipoPrice == null ? 'Halka arz fiyatı otomatik bulunamadı.' : null),
      },
    });
  }

  async function refreshRaw(raw, { force = false } = {}) {
    const nowDate = now();
    const needMarket = force || snapshotAge(nowDate, raw.marketSnapshot) >= MARKET_TTL_MS;
    const needIpo = force || snapshotAge(nowDate, raw.ipoSnapshot) >= IPO_TTL_MS;
    const marketPromise = needMarket ? getMarket(raw.ticker) : Promise.resolve(null);
    const ipoPromise = needIpo ? getIpo(raw.ticker) : Promise.resolve(null);
    const [marketResult, ipoResult] = await Promise.allSettled([marketPromise, ipoPromise]);
    const next = { ...raw };
    const errors = {};
    const fetchedAt = nowDate.toISOString();

    if (needMarket) {
      if (marketResult.status === 'fulfilled') next.marketSnapshot = { ...marketResult.value, fetchedAt };
      else errors.market = messageOf(marketResult.reason, 'Fiyat verisi alınamadı.');
    }
    if (needIpo) {
      if (ipoResult.status === 'fulfilled') next.ipoSnapshot = { ...ipoResult.value, fetchedAt };
      else errors.ipo = messageOf(ipoResult.reason, 'Halka arz verisi alınamadı.');
    }
    return { raw: next, errors };
  }

  function portfolioFrom(data, errorsById = new Map()) {
    const holdings = (data.holdings || []).map(raw => hydrate(raw, errorsById.get(raw.id) || {}));
    return {
      holdings,
      totals: calculateTotals(holdings),
      history: makePortfolioHistory(holdings),
      updatedAt: now().toISOString(),
    };
  }

  async function getPortfolio({ refresh = true, force = false } = {}) {
    const data = await repository.load();
    if (!refresh || !data.holdings.length) return portfolioFrom(data);
    const refreshed = await Promise.all(data.holdings.map(raw => refreshRaw(raw, { force })));
    data.holdings = refreshed.map(item => item.raw);
    await repository.save(data);
    const errorsById = new Map(refreshed.map(item => [item.raw.id, item.errors]));
    return portfolioFrom(data, errorsById);
  }

  async function lookup(ticker) {
    const key = cleanTicker(ticker);
    if (!key) throw new Error('Geçerli bir hisse kodu girin.');
    const [market, ipo] = await Promise.allSettled([getMarket(key), getIpo(key)]);
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
    const data = await repository.load();
    if (data.holdings.some(item => cleanTicker(item.ticker) === key)) throw new Error(`${key} zaten portföyde.`);

    const [marketResult, ipoResult] = await Promise.allSettled([getMarket(key), getIpo(key)]);
    if (marketResult.status !== 'fulfilled') throw new Error(`${key} için BIST fiyat verisi bulunamadı. Kod doğru mu?`);
    const stamp = now().toISOString();
    const raw = {
      id: uuid(),
      ticker: key,
      initialLots: lotCount,
      currentLots: lotCount,
      addedAt: stamp,
      ipoPriceOverride: positiveNumber(ipoPriceOverride),
      firstTradeDateOverride: firstTradeDateOverride || null,
      sales: [],
      marketSnapshot: { ...marketResult.value, fetchedAt: stamp },
      ipoSnapshot: ipoResult.status === 'fulfilled' ? { ...ipoResult.value, fetchedAt: stamp } : null,
    };
    data.holdings.push(raw);
    await repository.save(data);
    return {
      holding: hydrate(raw, { ipo: ipoResult.status === 'rejected' ? messageOf(ipoResult.reason, 'Halka arz verisi alınamadı.') : null }),
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
      raw.firstTradeDateOverride = patch.firstTradeDateOverride || null;
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
    const stamp = now().toISOString();
    raw.sales.push({
      id: uuid(),
      lots: valid.lots,
      price: valid.price,
      date: date || stamp.slice(0, 10),
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
    const result = await refreshRaw(data.holdings[index], { force: true });
    data.holdings[index] = result.raw;
    await repository.save(data);
    return hydrate(result.raw, result.errors);
  }

  return { lookup, getPortfolio, addHolding, updateHolding, addSale, deleteHolding, refreshHolding };
}
