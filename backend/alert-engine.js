import { evaluateDailyAlerts, notificationPayloadForEvent } from '../public/core/notification-rules.js';

const MAX_QUOTE_AGE_MS = 15 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 60 * 1000;

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nullableFinite(value) {
  if (value == null || value === '') return null;
  return finite(value);
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function isFreshQuote(marketTime, now) {
  if (marketTime == null || marketTime === '' || now == null) return true;
  const marketMs = new Date(marketTime).getTime();
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  if (!Number.isFinite(marketMs) || !Number.isFinite(nowMs)) return false;
  const ageMs = nowMs - marketMs;
  return ageMs >= -MAX_FUTURE_CLOCK_SKEW_MS && ageMs <= MAX_QUOTE_AGE_MS;
}

export function evaluateRegistrationAlerts({ registration = {}, quotes = new Map(), day, now } = {}) {
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
    const quoteFresh = isFreshQuote(quote?.marketTime, now);
    const dailySessionActive = (!quote?.latestMarketDate || !day || quote.latestMarketDate === day) && quoteFresh;
    if (current == null || previousClose == null || previousClose <= 0 || !dailySessionActive) {
      holdings.push({ ticker, currentPrice:current, previousClose, dailySessionActive:false });
      continue;
    }

    valid += 1;
    holdings.push({
      ticker,
      currentPrice:current,
      previousClose,
      referencePrice:nullableFinite(quote?.referencePrice),
      sessionHigh:nullableFinite(quote?.sessionHigh),
      sessionLow:nullableFinite(quote?.sessionLow),
      dailySessionActive:true,
    });
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
