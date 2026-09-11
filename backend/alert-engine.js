import { evaluateDailyAlerts, notificationPayloadForEvent } from '../public/core/notification-rules.js';

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

export function evaluateRegistrationAlerts({ registration = {}, quotes = new Map(), day } = {}) {
  const holdings = [];
  let previousValue = 0;
  let currentValue = 0;
  let expected = 0;
  let valid = 0;

  for (const item of Array.isArray(registration.holdings) ? registration.holdings : []) {
    const ticker = normalizeTicker(item?.ticker);
    const lots = finite(item?.lots);
    if (!ticker || lots == null || lots <= 0) continue;
    expected += 1;
    const quote = quotes instanceof Map ? quotes.get(ticker) : quotes?.[ticker];
    const current = finite(quote?.current);
    const previousClose = finite(quote?.previousClose);
    const dailySessionActive = !quote?.latestMarketDate || !day || quote.latestMarketDate === day;
    if (current == null || previousClose == null || previousClose <= 0 || !dailySessionActive) {
      holdings.push({ ticker, currentPrice:current, previousClose, dailySessionActive:false });
      continue;
    }

    valid += 1;
    holdings.push({ ticker, currentPrice:current, previousClose, dailySessionActive:true });
    previousValue += previousClose * lots;
    currentValue += current * lots;
  }

  const completeCoverage = expected > 0 && valid === expected && previousValue > 0;
  const portfolioPct = completeCoverage
    ? ((currentValue - previousValue) / previousValue) * 100
    : null;
  const result = evaluateDailyAlerts({
    day:String(day || ''),
    threshold:registration.threshold,
    enabled:registration.enabled !== false,
    holdings,
    portfolioPct:portfolioPct ?? 0,
    previousState:registration.alertState,
  });
  return { ...result, portfolioPct };
}

export function notificationForAlert(event = {}) {
  const payload = notificationPayloadForEvent(event);
  return {
    title:payload.title,
    body:payload.body,
    data:{
      kind:String(payload.kind || 'portfolio'),
      ticker:String(payload.ticker || ''),
      level:String(Number(event.level) || 0),
      dailyPct:String(Number(event.dailyPct) || 0),
    },
  };
}
