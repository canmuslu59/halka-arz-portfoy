import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const assetRoot = process.env.TEST_ASSET_ROOT || 'android/app/src/main/assets/www';
const domainPath = join(assetRoot, 'core/domain.js');
const servicePath = join(assetRoot, 'core/portfolio-service.js');
const ledgerPath = join(assetRoot, 'core/purchase-ledger.js');

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, () => replacement);
}

function replaceSection(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`${label}: section boundary not found`);
  return text.slice(0, start) + replacement + '\n\n' + text.slice(end);
}

const ledgerSource = `function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function isoDate(value) {
  const text = String(value || '').slice(0, 10);
  return /^\\d{4}-\\d{2}-\\d{2}$/.test(text) ? text : null;
}

function compareEvents(a, b) {
  const dateOrder = String(a.date).localeCompare(String(b.date));
  if (dateOrder) return dateOrder;
  const stampOrder = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  if (stampOrder) return stampOrder;
  if (a.kind === b.kind) return Number(a.order || 0) - Number(b.order || 0);
  return a.kind === 'buy' ? -1 : 1;
}

export function normalizedPurchases(holding = {}) {
  const explicit = (Array.isArray(holding.purchases) ? holding.purchases : [])
    .map((purchase, order) => ({
      ...purchase,
      lots: Number(purchase?.lots || 0),
      price: positiveNumber(purchase?.price),
      date: isoDate(purchase?.date),
      createdAt: purchase?.createdAt || null,
      order,
    }))
    .filter(purchase => Number.isInteger(purchase.lots) && purchase.lots > 0 && purchase.price != null && purchase.date)
    .sort(compareEvents);
  if (explicit.length) return explicit;

  const lots = Number(holding.initialLots ?? holding.currentLots ?? 0);
  const price = positiveNumber(holding.ipoPrice);
  const date = isoDate(holding.firstTradeDate)
    || isoDate(Array.isArray(holding.history) ? holding.history[0]?.date : null)
    || isoDate(holding.addedAt);
  if (!Number.isInteger(lots) || lots <= 0 || price == null || !date) return [];
  return [{
    id: 'legacy-' + String(holding.id || holding.ticker || 'holding'),
    lots,
    price,
    date,
    createdAt: holding.addedAt || (date + 'T00:00:00.000Z'),
    legacy: true,
    order: 0,
  }];
}

function normalizedSales(holding = {}) {
  return (Array.isArray(holding.sales) ? holding.sales : [])
    .map((sale, order) => ({
      ...sale,
      lots: Number(sale?.lots || 0),
      price: positiveNumber(sale?.price),
      costPrice: positiveNumber(sale?.costPrice),
      date: isoDate(sale?.date),
      createdAt: sale?.createdAt || null,
      order,
    }))
    .filter(sale => Number.isInteger(sale.lots) && sale.lots > 0 && sale.price != null && sale.date)
    .sort(compareEvents);
}

export function calculatePurchaseLedger(holding = {}, { throughDate = null } = {}) {
  const limit = isoDate(throughDate);
  const purchases = normalizedPurchases(holding);
  const sales = normalizedSales(holding);
  const events = [
    ...purchases.map((purchase, order) => ({ ...purchase, kind:'buy', order })),
    ...sales.map((sale, order) => ({ ...sale, kind:'sell', order })),
  ].filter(event => !limit || event.date <= limit).sort(compareEvents);

  let activeLots = 0;
  let activeCost = 0;
  let totalPurchasedLots = 0;
  let totalPurchaseCost = 0;
  let grossSalesProceeds = 0;
  let grossRealizedProfit = 0;
  let withholdingTax = 0;
  let lastAveragePurchasePrice = null;
  const enrichedSales = [];

  for (const event of events) {
    if (event.kind === 'buy') {
      const cost = event.lots * event.price;
      activeLots += event.lots;
      activeCost += cost;
      totalPurchasedLots += event.lots;
      totalPurchaseCost += cost;
      lastAveragePurchasePrice = activeLots > 0 ? activeCost / activeLots : lastAveragePurchasePrice;
      continue;
    }

    const availableAverage = activeLots > 0 ? activeCost / activeLots : lastAveragePurchasePrice;
    const costPrice = event.costPrice ?? availableAverage;
    const removableLots = Math.min(event.lots, Math.max(0, activeLots));
    const removedCost = costPrice == null ? 0 : removableLots * costPrice;
    activeLots = Math.max(0, activeLots - removableLots);
    activeCost = Math.max(0, activeCost - removedCost);
    if (activeLots === 0 && activeCost < 0.0000001) activeCost = 0;
    if (activeLots > 0) lastAveragePurchasePrice = activeCost / activeLots;
    else if (costPrice != null) lastAveragePurchasePrice = costPrice;

    const proceeds = event.lots * event.price;
    const realized = costPrice == null ? 0 : event.lots * (event.price - costPrice);
    const tax = costPrice == null ? 0 : Math.max(0, realized) * 0.175;
    grossSalesProceeds += proceeds;
    grossRealizedProfit += realized;
    withholdingTax += tax;
    enrichedSales.push({ ...event, costPrice });
  }

  const averagePurchasePrice = activeLots > 0
    ? activeCost / activeLots
    : lastAveragePurchasePrice;
  return {
    purchases: purchases.filter(purchase => !limit || purchase.date <= limit),
    sales: enrichedSales,
    currentLots: activeLots,
    positionCost: activeCost,
    averagePurchasePrice,
    totalPurchasedLots,
    totalPurchaseCost,
    grossSalesProceeds,
    grossRealizedProfit,
    withholdingTax,
    salesProceeds: grossSalesProceeds - withholdingTax,
    realizedProfit: grossRealizedProfit - withholdingTax,
  };
}
`;
writeFileSync(ledgerPath, ledgerSource);

let domain = readFileSync(domainPath, 'utf8');
if (!domain.includes("from './purchase-ledger.js'")) {
  domain = "import { normalizedPurchases, calculatePurchaseLedger } from './purchase-ledger.js';\n" + domain;
}

const calculateHoldingReplacement = `export function calculateHolding(holding, { today = null } = {}) {
  const originalPriceValue = nullableFiniteNumber(holding.ipoPrice);
  const originalPrice = originalPriceValue != null && originalPriceValue > 0 ? originalPriceValue : null;
  const ledger = calculatePurchaseLedger({ ...holding, ipoPrice: originalPrice });
  const costBasisKnown = ledger.purchases.length > 0;
  const initialLots = costBasisKnown ? ledger.totalPurchasedLots : Number(holding.initialLots ?? holding.currentLots ?? 0);
  const currentLots = costBasisKnown ? ledger.currentLots : Number(holding.currentLots ?? 0);
  const averagePurchasePrice = costBasisKnown ? ledger.averagePurchasePrice : originalPrice;
  const ipoPrice = averagePurchasePrice ?? originalPrice;
  const positionCost = costBasisKnown ? ledger.positionCost : (ipoPrice == null ? null : currentLots * ipoPrice);
  const currentPrice = nullableFiniteNumber(holding.currentPrice);
  const previousClose = nullableFiniteNumber(holding.previousClose);
  const purchases = costBasisKnown ? ledger.purchases : [];
  const sales = costBasisKnown ? ledger.sales : (Array.isArray(holding.sales) ? holding.sales : []);

  const invested = costBasisKnown ? ledger.totalPurchaseCost : (ipoPrice == null ? null : initialLots * ipoPrice);
  const activeValue = currentLots === 0 ? 0 : currentPrice == null ? null : currentLots * currentPrice;
  const grossSalesProceeds = costBasisKnown
    ? ledger.grossSalesProceeds
    : sales.reduce((sum, sale) => sum + Number(sale.lots || 0) * Number(sale.price || 0), 0);
  const grossRealizedProfit = costBasisKnown
    ? ledger.grossRealizedProfit
    : ipoPrice == null ? null : sales.reduce((sum, sale) => sum + Number(sale.lots || 0) * (Number(sale.price || 0) - ipoPrice), 0);
  const withholdingTax = costBasisKnown
    ? ledger.withholdingTax
    : ipoPrice == null ? 0 : sales.reduce((sum, sale) => sum + saleWithholding(sale.lots, sale.price, sale.costPrice ?? ipoPrice), 0);
  const salesProceeds = grossSalesProceeds - withholdingTax;
  const realizedProfit = grossRealizedProfit == null ? null : grossRealizedProfit - withholdingTax;
  const unrealizedProfit = currentLots === 0 ? 0 : currentPrice == null || positionCost == null ? null : activeValue - positionCost;
  const totalProfit = realizedProfit == null || unrealizedProfit == null ? null : realizedProfit + unrealizedProfit;
  const totalWealth = activeValue == null ? null : activeValue + salesProceeds;
  const latestMarketDate = holding.latestMarketDate || null;
  const sessionIsToday = !today || latestMarketDate === today;
  const todaySales = today ? sales.filter(sale => sale.date === today) : [];
  const soldTodayLots = todaySales.reduce((sum, sale) => sum + Number(sale.lots || 0), 0);
  const dailyBaseLots = currentLots + soldTodayLots;
  const saleDayGain = previousClose == null
    ? null
    : todaySales.reduce((sum, sale) => sum + Number(sale.lots || 0) * (Number(sale.price || 0) - previousClose), 0);
  const todayWithholdingTax = todaySales.reduce((sum, sale) => {
    const costPrice = nullableFiniteNumber(sale.costPrice) ?? ipoPrice;
    return sum + (costPrice == null ? 0 : saleWithholding(sale.lots, sale.price, costPrice));
  }, 0);
  const hasDailyMarketPrices = previousClose != null && (currentLots === 0 || currentPrice != null);
  const dailyProfit = !hasDailyMarketPrices
    ? null
    : !sessionIsToday
      ? 0
      : (currentLots === 0 ? 0 : currentLots * (currentPrice - previousClose)) + saleDayGain - todayWithholdingTax;
  const dailyBase = previousClose != null && dailyBaseLots > 0 ? previousClose * dailyBaseLots : 0;
  const dailyPct = dailyProfit == null || !(dailyBase > 0)
    ? null
    : !sessionIsToday
      ? 0
      : (dailyProfit / dailyBase) * 100;

  return {
    ...holding,
    ticker: cleanTicker(holding.ticker),
    initialLots,
    currentLots,
    ipoPrice,
    averagePurchasePrice,
    positionCost,
    purchases,
    currentPrice,
    previousClose,
    latestMarketDate,
    sales,
    invested,
    activeValue,
    grossSalesProceeds,
    withholdingTax,
    salesProceeds,
    totalWealth,
    grossRealizedProfit,
    realizedProfit,
    unrealizedProfit,
    totalProfit,
    totalProfitPct: invested != null && totalProfit != null ? profitPct(totalProfit, invested) : null,
    dailyBaseLots,
    dailyProfit,
    dailyPct,
    dailySessionActive: sessionIsToday,
  };
}`;
domain = replaceSection(domain, 'export function calculateHolding(', 'export function calculateTotals(', calculateHoldingReplacement, 'calculate holding');

const historyReplacement = `function historyStateOnDate(holding, date) {
  const fullLedger = calculatePurchaseLedger(holding);
  const purchases = fullLedger.purchases;
  const start = purchases[0]?.date || holding.firstTradeDate || holding.history?.[0]?.date || null;
  if (!start || date < start || !purchases.length) return null;

  const rows = Array.isArray(holding.history) ? holding.history : [];
  let close = null;
  for (const row of rows) {
    if (!row?.date || row.date > date) break;
    const rowClose = nullableFiniteNumber(row.close);
    if (row.date >= start && rowClose != null) close = rowClose;
  }
  const ledger = calculatePurchaseLedger(holding, { throughDate:date });
  if (close == null && ledger.currentLots > 0) {
    const sameDayPurchase = ledger.purchases.filter(purchase => purchase.date === date).slice(-1)[0];
    if (sameDayPurchase) close = sameDayPurchase.price;
  }
  if (close == null && ledger.currentLots > 0) return null;
  const capitalAdded = ledger.purchases
    .filter(purchase => purchase.date === date)
    .reduce((sum, purchase) => sum + Number(purchase.lots) * Number(purchase.price), 0);
  return {
    value: ledger.currentLots * (close ?? 0) + ledger.salesProceeds,
    cost: ledger.totalPurchaseCost,
    capitalAdded,
  };
}

export function makePortfolioHistory(holdings) {
  const dates = new Set();
  for (const holding of holdings) {
    const ledger = calculatePurchaseLedger(holding);
    const purchases = ledger.purchases;
    const start = purchases[0]?.date || holding.firstTradeDate || holding.history?.[0]?.date;
    if (!start || !purchases.length) continue;
    for (const purchase of purchases) dates.add(purchase.date);
    for (const row of Array.isArray(holding.history) ? holding.history : []) {
      if (row?.date && row.date >= start) dates.add(row.date);
    }
    for (const sale of ledger.sales) {
      if (sale.date >= start) dates.add(sale.date);
    }
  }

  const rows = [...dates].sort().map(date => {
    let value = 0;
    let cost = 0;
    let capitalAdded = 0;
    let complete = true;
    for (const holding of holdings) {
      const state = historyStateOnDate(holding, date);
      if (!state) {
        const purchases = normalizedPurchases(holding);
        const start = purchases[0]?.date || holding.firstTradeDate || holding.history?.[0]?.date;
        if (!start || date >= start) complete = false;
        continue;
      }
      value += state.value;
      cost += state.cost;
      capitalAdded += state.capitalAdded;
    }
    const profit = value - cost;
    return { date, value:complete ? value : null, cost, profit:complete ? profit : null, profitPct:complete ? profitPct(profit, cost) : null, capitalAdded, complete };
  }).filter(row => row.cost > 0);

  let previousValue = 0;
  let previousProfit = 0;
  return rows.map((row, index) => {
    const dailyProfit = row.profit == null || (index && previousProfit == null) ? null : row.profit - (index ? previousProfit : 0);
    const dailyBase = previousValue + row.capitalAdded;
    const dailyPct = dailyProfit == null || (index && previousValue == null) ? null : dailyBase > 0 ? (dailyProfit / dailyBase) * 100 : 0;
    previousValue = row.value;
    previousProfit = row.profit;
    return { ...row, dailyProfit, dailyPct };
  });
}`;
domain = replaceSection(domain, 'function normalizedSales(', 'export function validateSale(', historyReplacement, 'portfolio history');
writeFileSync(domainPath, domain);

let service = readFileSync(servicePath, 'utf8');
service = replaceOnce(
  service,
  "} from './domain.js';\n",
  "} from './domain.js';\nimport { normalizedPurchases } from './purchase-ledger.js';\n",
  'purchase ledger import',
);

const duplicateNeedle = "    const data = await repository.load();\n    if (data.holdings.some(item => cleanTicker(item.ticker) === key)) throw new Error(`${key} zaten portföyde.`);";
const duplicateReplacement = `    const data = await repository.load();
    const existingIndex = data.holdings.findIndex(item => cleanTicker(item.ticker) === key);
    if (existingIndex >= 0) {
      const purchasePrice = positiveNumber(ipoPriceOverride);
      if (purchasePrice == null || !normalizedFirstTradeDateOverride) {
        throw new Error(key + ' zaten portföyde; yeni alım için alış fiyatı ve tarihi gerekli.');
      }
      const stamp = now().toISOString();
      const raw = { ...data.holdings[existingIndex], sales:[...(data.holdings[existingIndex].sales || [])] };
      const effectivePrice = positiveNumber(raw.ipoPriceOverride) ?? positiveNumber(raw.ipoSnapshot?.ipoPrice);
      const effectiveDate = raw.firstTradeDateOverride || raw.ipoSnapshot?.firstTradeDate || raw.addedAt?.slice(0, 10) || null;
      const purchases = normalizedPurchases({ ...raw, ipoPrice:effectivePrice, firstTradeDate:effectiveDate }).map(purchase => ({ ...purchase }));
      purchases.push({
        id: uuid(),
        lots: lotCount,
        price: purchasePrice,
        date: normalizedFirstTradeDateOverride,
        createdAt: stamp,
      });
      purchases.sort((a,b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
      raw.purchases = purchases;
      raw.initialLots = purchases.reduce((sum, purchase) => sum + Number(purchase.lots || 0), 0);
      raw.currentLots = Number(raw.currentLots || 0) + lotCount;
      const earliestPurchaseDate = purchases[0]?.date || null;
      if (earliestPurchaseDate && (!effectiveDate || earliestPurchaseDate < effectiveDate)) {
        raw.firstTradeDateOverride = earliestPurchaseDate;
        raw.historySnapshot = null;
      }
      data.holdings[existingIndex] = raw;
      await repository.save(data);
      return { holding:hydrate(raw), autoIpoFound:false, merged:true };
    }`;
service = replaceOnce(service, duplicateNeedle, duplicateReplacement, 'duplicate purchase merge');

const saleNeedle = `    if (firstTradeDate && saleDate < firstTradeDate) throw new Error('Satış tarihi ilk işlem tarihinden önce olamaz.');
    const stamp = now().toISOString();
    raw.sales.push({
      id: uuid(),
      operationId,
      lots: valid.lots,
      price: valid.price,
      date: saleDate,
      createdAt: stamp,
    });`;
const saleReplacement = `    if (firstTradeDate && saleDate < firstTradeDate) throw new Error('Satış tarihi ilk işlem tarihinden önce olamaz.');
    const stamp = now().toISOString();
    const beforeSale = hydrate(raw);
    const costPrice = positiveNumber(beforeSale.averagePurchasePrice) ?? positiveNumber(beforeSale.ipoPrice);
    raw.sales.push({
      id: uuid(),
      operationId,
      lots: valid.lots,
      price: valid.price,
      costPrice,
      date: saleDate,
      createdAt: stamp,
    });`;
service = replaceOnce(service, saleNeedle, saleReplacement, 'sale cost basis snapshot');
writeFileSync(servicePath, service);

console.log('Applied test-only repeated-purchase ledger and merge behavior.');
