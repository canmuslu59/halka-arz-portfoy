function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pct(part, total) {
  return Number(total) > 0 ? (Number(part || 0) / Number(total)) * 100 : 0;
}

function validHistoryRows(history) {
  const rows = Array.isArray(history) ? history : [];
  let runningPeak = null;
  return rows
    .filter(row => row && typeof row.date === 'string' && row.complete !== false && finite(row.value) != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(row => {
      const value = Number(row.value);
      runningPeak = runningPeak == null ? value : Math.max(runningPeak, value);
      const drawdownPct = runningPeak > 0 ? ((value - runningPeak) / runningPeak) * 100 : 0;
      return { ...row, value, drawdownPct };
    });
}

function cutoffDate(lastDate, range) {
  const days = ({ '1H':7, '7D':7, '1A':31, '1M':31, '3A':93, '3M':93, '1Y':366 })[range];
  if (!days) return null;
  const d = new Date(`${lastDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function buildPremiumSeries({ history = [], metric = 'value', range = 'ALL' } = {}) {
  const rows = validHistoryRows(history);
  if (!rows.length) return [];
  const lastDate = rows.at(-1).date;
  const cutoff = cutoffDate(lastDate, range);
  const selected = cutoff ? rows.filter(row => row.date >= cutoff) : rows;
  const yFor = row => {
    if (metric === 'drawdown') return finite(row.drawdownPct);
    if (metric === 'profit') return finite(row.profit);
    if (metric === 'returnPct') return finite(row.profitPct);
    return finite(row.value);
  };
  return selected
    .map(row => ({
      date:row.date,
      y:yFor(row),
      value:finite(row.value),
      cost:finite(row.cost),
      profit:finite(row.profit),
      profitPct:finite(row.profitPct),
      dailyProfit:finite(row.dailyProfit),
      dailyPct:finite(row.dailyPct),
      drawdownPct:finite(row.drawdownPct) ?? 0,
    }))
    .filter(row => row.y != null);
}

export function buildPremiumAnalytics({ portfolio = null, history = [] } = {}) {
  const totals = portfolio?.totals || {};
  const holdings = Array.isArray(portfolio?.holdings) ? portfolio.holdings : [];
  const rows = validHistoryRows(history);
  const currentValue = rows.length ? rows.at(-1).value : finite(totals.totalWealth) ?? finite(totals.activeValue) ?? 0;
  const peakValue = rows.length ? Math.max(...rows.map(row => row.value)) : currentValue;
  const currentDrawdownPct = peakValue > 0 ? ((currentValue - peakValue) / peakValue) * 100 : 0;
  const maxDrawdownPct = rows.length ? Math.min(...rows.map(row => row.drawdownPct)) : 0;

  const dayRows = rows.filter(row => finite(row.dailyProfit) != null);
  const bestDay = dayRows.length
    ? dayRows.reduce((best, row) => Number(row.dailyProfit) > Number(best.dailyProfit) ? row : best)
    : null;
  const worstDay = dayRows.length
    ? dayRows.reduce((worst, row) => Number(row.dailyProfit) < Number(worst.dailyProfit) ? row : worst)
    : null;

  const allocationBase = holdings
    .map(holding => ({
      ticker:String(holding?.ticker || '').toUpperCase(),
      sector:String(holding?.sector || 'Diğer'),
      value:Math.max(0, finite(holding?.activeValue) ?? 0),
      invested:finite(holding?.invested) ?? 0,
      realizedProfit:finite(holding?.realizedProfit) ?? 0,
      unrealizedProfit:finite(holding?.unrealizedProfit) ?? 0,
      totalProfit:finite(holding?.totalProfit) ?? 0,
      dailyProfit:finite(holding?.dailyProfit) ?? 0,
    }))
    .filter(row => row.ticker);
  const activeTotal = allocationBase.reduce((sum, row) => sum + row.value, 0);

  const allocationByHolding = allocationBase
    .filter(row => row.value > 0)
    .map(row => ({ name:row.ticker, ticker:row.ticker, sector:row.sector, value:row.value, pct:pct(row.value, activeTotal) }))
    .sort((a, b) => b.value - a.value);

  const sectors = new Map();
  for (const row of allocationByHolding) sectors.set(row.sector, (sectors.get(row.sector) || 0) + row.value);
  const allocationBySector = [...sectors.entries()]
    .map(([name, value]) => ({ name, value, pct:pct(value, activeTotal) }))
    .sort((a, b) => b.value - a.value);

  const totalProfit = finite(totals.totalProfit) ?? allocationBase.reduce((sum, row) => sum + row.totalProfit, 0);
  const holdingContributions = allocationBase
    .map(row => ({
      ticker:row.ticker,
      sector:row.sector,
      invested:row.invested,
      activeValue:row.value,
      realizedProfit:row.realizedProfit,
      unrealizedProfit:row.unrealizedProfit,
      totalProfit:row.totalProfit,
      dailyProfit:row.dailyProfit,
      contributionPct:totalProfit !== 0 ? (row.totalProfit / Math.abs(totalProfit)) * 100 : 0,
      weightPct:pct(row.value, activeTotal),
    }))
    .sort((a, b) => b.totalProfit - a.totalProfit);

  const topHoldingSharePct = allocationByHolding[0]?.pct || 0;
  const topThreeSharePct = allocationByHolding.slice(0, 3).reduce((sum, row) => sum + row.pct, 0);

  return {
    invested:finite(totals.invested),
    activeValue:finite(totals.activeValue),
    salesProceeds:finite(totals.salesProceeds),
    realizedProfit:finite(totals.realizedProfit) ?? allocationBase.reduce((sum, row) => sum + row.realizedProfit, 0),
    unrealizedProfit:finite(totals.unrealizedProfit) ?? allocationBase.reduce((sum, row) => sum + row.unrealizedProfit, 0),
    totalProfit,
    dailyProfit:finite(totals.dailyProfit),
    dailyPct:finite(totals.dailyPct),
    totalProfitPct:finite(totals.totalProfitPct),
    peakValue,
    currentDrawdownPct,
    maxDrawdownPct,
    bestDay,
    worstDay,
    topHoldingSharePct,
    topThreeSharePct,
    holdingContributions,
    allocationByHolding,
    allocationBySector,
  };
}
