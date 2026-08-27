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

export function calculateHolding(holding) {
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
  const dailyProfit = currentPrice == null || previousClose == null ? null : currentLots * (currentPrice - previousClose);
  const dailyPct = currentPrice == null || !(previousClose > 0) ? null : ((currentPrice - previousClose) / previousClose) * 100;

  return {
    ...holding,
    ticker: cleanTicker(holding.ticker),
    initialLots,
    currentLots,
    ipoPrice,
    currentPrice,
    previousClose,
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
    return sum + (Number.isFinite(holding.previousClose) ? holding.previousClose * Number(holding.currentLots || 0) : 0);
  }, 0);
  totals.dailyPct = dailyBase > 0 ? (totals.dailyProfit / dailyBase) * 100 : 0;
  return totals;
}

export function makePortfolioHistory(holdings) {
  const byDate = new Map();
  for (const holding of holdings) {
    if (!holding.ipoPrice || !holding.initialLots || !Array.isArray(holding.history)) continue;
    const start = holding.firstTradeDate || holding.history[0]?.date;
    for (const row of holding.history) {
      if (start && row.date < start) continue;
      if (!byDate.has(row.date)) byDate.set(row.date, { date: row.date, value: 0, cost: 0 });
      const bucket = byDate.get(row.date);
      bucket.value += Number(row.close) * Number(holding.currentLots || 0);
      bucket.cost += Number(holding.ipoPrice) * Number(holding.currentLots || 0);
    }
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(row => ({ ...row, profit: row.value - row.cost }));
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
