export function normalizeAlertThreshold(value) {
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const threshold = Number(normalized);
  return Number.isFinite(threshold) && threshold >= 0.1 && threshold <= 100 ? threshold : null;
}

export function classifyDailyChange(dailyPct, threshold) {
  const change = Number(dailyPct);
  const limit = normalizeAlertThreshold(threshold);
  if (!Number.isFinite(change) || limit == null) return 'neutral';
  if (change >= limit) return 'up';
  if (change <= -limit) return 'down';
  return 'neutral';
}

export function transitionAlertState(previous, { tradingDate, dailyPct, threshold }) {
  const zone = classifyDailyChange(dailyPct, threshold);
  const previousZone = previous?.tradingDate === tradingDate ? previous.zone : 'neutral';
  return {
    tradingDate,
    zone,
    shouldNotify: zone !== 'neutral' && zone !== previousZone,
  };
}
