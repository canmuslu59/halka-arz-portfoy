function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function bistTickSize(price) {
  const p = finitePositive(price);
  if (p == null) return null;
  if (p < 20) return 0.01;
  if (p < 50) return 0.02;
  if (p < 100) return 0.05;
  if (p < 250) return 0.1;
  if (p < 500) return 0.25;
  if (p < 1000) return 0.5;
  if (p < 2500) return 1;
  return 2.5;
}

function decimalPlaces(step) {
  const s = String(step);
  return s.includes('.') ? s.length - s.indexOf('.') - 1 : 0;
}

function roundForStep(value, step) {
  return Number(value.toFixed(Math.max(2, decimalPlaces(step))));
}

export function ceilingPrice(basePrice) {
  const base = finitePositive(basePrice);
  if (base == null) return null;
  const theoretical = base * 1.10;
  const step = bistTickSize(theoretical);
  if (step == null) return null;
  const floored = Math.floor((theoretical + 1e-9) / step) * step;
  return roundForStep(floored, step);
}

export function analyzeCeilingSeries({ ipoPrice, firstTradeDate = null, history = [] } = {}) {
  const initial = finitePositive(ipoPrice);
  if (initial == null) return { openingStreak:0, totalCeilingDays:0, rows:[] };
  const sorted = (Array.isArray(history) ? history : [])
    .filter(row => row?.date && (!firstTradeDate || row.date >= firstTradeDate) && Number.isFinite(Number(row.close)))
    .slice()
    .sort((a,b) => a.date.localeCompare(b.date));

  let base = initial;
  let openingStreak = 0;
  let streakOpen = true;
  let totalCeilingDays = 0;
  const rows = [];
  for (const row of sorted) {
    const close = Number(row.close);
    const ceiling = ceilingPrice(base);
    const step = bistTickSize(ceiling);
    const tolerance = Math.max(0.005, Number(step || 0.01) / 2 + 1e-8);
    const isCeiling = ceiling != null && Math.abs(close - ceiling) <= tolerance;
    if (isCeiling) {
      totalCeilingDays += 1;
      if (streakOpen) openingStreak += 1;
    } else {
      streakOpen = false;
    }
    rows.push({
      date:row.date,
      base:roundForStep(base, bistTickSize(base) || 0.01),
      ceiling,
      close,
      dailyPct:base > 0 ? ((close - base) / base) * 100 : null,
      isCeiling,
    });
    base = close;
  }
  return { openingStreak, totalCeilingDays, rows };
}

export function simulateCeilings(ipoPrice, count = 20) {
  const initial = finitePositive(ipoPrice);
  const max = Math.max(0, Math.min(20, Math.trunc(Number(count) || 0)));
  if (initial == null || max === 0) return [];
  const rows = [];
  let price = initial;
  for (let index = 1; index <= max; index += 1) {
    price = ceilingPrice(price);
    if (price == null) break;
    rows.push({
      count:index,
      price,
      returnPct:((price - initial) / initial) * 100,
    });
  }
  return rows;
}
