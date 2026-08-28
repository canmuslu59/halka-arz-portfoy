export function cleanTicker(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\.IS$/i, '')
    .replace(/\.E$/i, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export function profitPct(profit, cost) {
  return Number(cost) > 0 ? (Number(profit) / Number(cost)) * 100 : 0;
}

export function calculateHolding(holding, { today = null } = {}) {
  const initialLots = Number(holding.initialLots ?? holding.currentLots ?? 0);
  const currentLots = Number(holding.currentLots ?? 0);
  const ipoPrice = Number.isFinite(Number(holding.ipoPrice)) && Number(holding.ipoPrice) > 0 ? Number(holding.ipoPrice) : null;
  const currentPrice = Number.isFinite(Number(holding.currentPrice)) ? Number(holding.currentPrice) : null;
  const previousClose = Number.isFinite(Number(holding.previousClose)) ? Number(holding.previousClose) : null;
  const sales = Array.isArray(holding.sales) ? holding.sales : [];

  const invested = ipoPrice == null ? null : initialLots * ipoPrice;
  const activeValue = currentPrice == null ? null : currentLots * currentPrice;
  const salesProceeds = sales.reduce((sum, sale) => sum + Number(sale.lots || 0) * Number(sale.price || 0), 0);
  const realizedProfit = ipoPrice == null
    ? null
    : sales.reduce((sum, sale) => sum + Number(sale.lots || 0) * (Number(sale.price || 0) - ipoPrice), 0);
  const unrealizedProfit = currentPrice == null || ipoPrice == null ? null : currentLots * (currentPrice - ipoPrice);
  const totalProfit = realizedProfit == null || unrealizedProfit == null ? null : realizedProfit + unrealizedProfit;
  const totalWealth = activeValue == null ? null : activeValue + salesProceeds;
  const latestMarketDate = holding.latestMarketDate || null;
  const sessionIsToday = !today || !latestMarketDate || latestMarketDate === today;
  const dailyProfit = !sessionIsToday
    ? 0
    : currentPrice == null || previousClose == null
      ? null
      : currentLots * (currentPrice - previousClose);
  const dailyPct = !sessionIsToday
    ? 0
    : currentPrice == null || !(previousClose > 0)
      ? null
      : ((currentPrice - previousClose) / previousClose) * 100;

  return {
    ...holding,
    ticker: cleanTicker(holding.ticker),
    initialLots,
    currentLots,
    ipoPrice,
    currentPrice,
    previousClose,
    latestMarketDate,
    sales,
    invested,
    activeValue,
    salesProceeds,
    totalWealth,
    realizedProfit,
    unrealizedProfit,
    totalProfit,
    totalProfitPct: invested != null && totalProfit != null ? profitPct(totalProfit, invested) : null,
    dailyProfit,
    dailyPct,
    dailySessionActive: sessionIsToday,
  };
}

export function calculateTotals(holdings) {
  const keys = ['invested', 'activeValue', 'salesProceeds', 'totalWealth', 'totalProfit', 'realizedProfit', 'unrealizedProfit', 'dailyProfit'];
  const totals = Object.fromEntries(keys.map(key => [key, 0]));
  for (const holding of holdings) {
    for (const key of keys) {
      if (Number.isFinite(holding[key])) totals[key] += holding[key];
    }
  }
  totals.totalProfitPct = totals.invested > 0 ? (totals.totalProfit / totals.invested) * 100 : 0;
  const dailyBase = holdings.reduce((sum, holding) => {
    if (holding.dailySessionActive === false) return sum;
    return sum + (Number.isFinite(holding.previousClose) ? holding.previousClose * Number(holding.currentLots || 0) : 0);
  }, 0);
  totals.dailyPct = dailyBase > 0 ? (totals.dailyProfit / dailyBase) * 100 : 0;
  return totals;
}

function normalizedSales(holding) {
  return (Array.isArray(holding.sales) ? holding.sales : [])
    .filter(sale => sale && typeof sale.date === 'string')
    .map(sale => ({ date: sale.date, lots: Number(sale.lots || 0), price: Number(sale.price || 0) }))
    .filter(sale => sale.lots > 0 && sale.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function historyStateOnDate(holding, date) {
  const start = holding.firstTradeDate || holding.history?.[0]?.date || null;
  const ipoPrice = Number(holding.ipoPrice);
  const initialLots = Number(holding.initialLots || 0);
  if (!start || date < start || !(ipoPrice > 0) || !(initialLots > 0)) return null;

  const rows = Array.isArray(holding.history) ? holding.history : [];
  let close = null;
  for (const row of rows) {
    if (!row?.date || row.date > date) break;
    if (row.date >= start && Number.isFinite(Number(row.close))) close = Number(row.close);
  }
  if (close == null && date === start) close = ipoPrice;
  if (close == null) return null;

  let soldLots = 0;
  let proceeds = 0;
  for (const sale of normalizedSales(holding)) {
    if (sale.date > date) break;
    soldLots += sale.lots;
    proceeds += sale.lots * sale.price;
  }
  const activeLots = Math.max(0, initialLots - soldLots);
  const cost = initialLots * ipoPrice;
  return {
    value: activeLots * close + proceeds,
    cost,
    capitalAdded: date === start ? cost : 0,
  };
}

export function makePortfolioHistory(holdings) {
  const dates = new Set();
  for (const holding of holdings) {
    const start = holding.firstTradeDate || holding.history?.[0]?.date;
    if (!start || !holding.ipoPrice || !holding.initialLots) continue;
    dates.add(start);
    for (const row of Array.isArray(holding.history) ? holding.history : []) {
      if (row?.date && row.date >= start) dates.add(row.date);
    }
    for (const sale of normalizedSales(holding)) {
      if (sale.date >= start) dates.add(sale.date);
    }
  }

  const rows = [...dates].sort().map(date => {
    let value = 0;
    let cost = 0;
    let capitalAdded = 0;
    for (const holding of holdings) {
      const state = historyStateOnDate(holding, date);
      if (!state) continue;
      value += state.value;
      cost += state.cost;
      capitalAdded += state.capitalAdded;
    }
    const profit = value - cost;
    return { date, value, cost, profit, profitPct: profitPct(profit, cost), capitalAdded };
  }).filter(row => row.cost > 0);

  let previousValue = 0;
  let previousProfit = 0;
  return rows.map((row, index) => {
    const dailyProfit = row.profit - (index ? previousProfit : 0);
    const dailyBase = previousValue + row.capitalAdded;
    const dailyPct = dailyBase > 0 ? (dailyProfit / dailyBase) * 100 : 0;
    previousValue = row.value;
    previousProfit = row.profit;
    return { ...row, dailyProfit, dailyPct };
  });
}

export function validateSale(holding, lots, price) {
  const saleLots = Number(lots);
  const salePrice = Number(price);
  if (!Number.isInteger(saleLots) || saleLots <= 0 || !Number.isFinite(salePrice) || salePrice <= 0) {
    throw new Error('Satış lotu ve fiyatı geçerli olmalı.');
  }
  if (saleLots > Number(holding.currentLots || 0)) {
    throw new Error('Satış lotu mevcut lottan fazla olamaz.');
  }
  return { lots: saleLots, price: salePrice };
}
