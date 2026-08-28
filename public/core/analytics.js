function finite(value, fallback = -Infinity) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function sortHoldings(holdings = [], key = 'dailyProfit') {
  const rows = [...holdings];
  if (key === 'ticker') return rows.sort((a,b) => String(a.ticker || '').localeCompare(String(b.ticker || ''), 'tr'));
  return rows.sort((a,b) => {
    const diff = finite(b?.[key]) - finite(a?.[key]);
    return diff || String(a.ticker || '').localeCompare(String(b.ticker || ''), 'tr');
  });
}

export function sectorBreakdown(holdings = []) {
  const grouped = new Map();
  for (const holding of holdings) {
    const value = finite(holding?.activeValue, 0);
    if (!(value > 0)) continue;
    const sector = String(holding?.sector || 'Bilinmiyor').trim() || 'Bilinmiyor';
    grouped.set(sector, (grouped.get(sector) || 0) + value);
  }
  const total = [...grouped.values()].reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return [];
  return [...grouped.entries()]
    .map(([sector, value]) => ({ sector, value, pct:(value / total) * 100 }))
    .sort((a,b) => b.value - a.value || a.sector.localeCompare(b.sector, 'tr'));
}

export function nearestChartIndex(clientX, bounds, count) {
  const length = Math.max(0, Number(count) || 0);
  if (!length) return -1;
  if (length === 1) return 0;
  const left = Number(bounds?.left) || 0;
  const right = Number(bounds?.right);
  const width = Number.isFinite(right) && right > left ? right - left : 1;
  const ratio = Math.max(0, Math.min(1, (Number(clientX) - left) / width));
  return Math.round(ratio * (length - 1));
}
