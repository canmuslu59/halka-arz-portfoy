import { evaluateDailyAlerts, notificationPayloadForEvent } from '../public/core/notification-rules.js';

const WITHHOLDING_RATE = 0.175;

function finite(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function salesForDay(item, day) {
  return (Array.isArray(item?.sales) ? item.sales : [])
    .filter(sale => sale?.date === day)
    .map(sale => ({ lots:finite(sale?.lots), price:finite(sale?.price) }))
    .filter(sale => sale.lots > 0 && sale.price > 0);
}

export function evaluateRegistrationAlerts({ registration = {}, quotes = new Map(), day } = {}) {
  const holdings = [];
  let previousValue = 0;
  let dailyProfit = 0;
  let expected = 0;
  let valid = 0;

  for (const item of Array.isArray(registration.holdings) ? registration.holdings : []) {
    const ticker = normalizeTicker(item?.ticker);
    const currentLots = Math.max(0, finite(item?.lots) ?? 0);
    const todaySales = salesForDay(item, day);
    const soldTodayLots = todaySales.reduce((sum, sale) => sum + sale.lots, 0);
    const dailyBaseLots = currentLots + soldTodayLots;
    if (!ticker || dailyBaseLots <= 0) continue;

    expected += 1;
    const quote = quotes instanceof Map ? quotes.get(ticker) : quotes?.[ticker];
    const current = finite(quote?.current);
    const previousClose = finite(quote?.previousClose);
    const floorPrice = finite(quote?.floorPrice);
    const ceilingPrice = finite(quote?.ceilingPrice);
    const referenceVerified = quote?.referenceVerified !== false;
    const dailySessionActive = Boolean(day && quote?.latestMarketDate === day && referenceVerified);
    if (!(current > 0) || !(previousClose > 0) || !dailySessionActive) {
      if (currentLots > 0) holdings.push({ ticker, currentPrice:current, previousClose, floorPrice, ceilingPrice, referenceVerified:false, dailySessionActive:false });
      continue;
    }

    valid += 1;
    if (currentLots > 0) holdings.push({ ticker, currentPrice:current, previousClose, floorPrice, ceilingPrice, referenceVerified:quote?.referenceVerified === true ? true : undefined, dailySessionActive:true });
    previousValue += previousClose * dailyBaseLots;

    let itemDailyProfit = currentLots * (current - previousClose);
    const ipoPrice = finite(item?.ipoPrice);
    for (const sale of todaySales) {
      itemDailyProfit += sale.lots * (sale.price - previousClose);
      if (ipoPrice > 0) {
        itemDailyProfit -= Math.max(0, sale.lots * (sale.price - ipoPrice)) * WITHHOLDING_RATE;
      }
    }
    dailyProfit += itemDailyProfit;
  }

  const portfolioPct = expected > 0 && valid === expected && previousValue > 0
    ? (dailyProfit / previousValue) * 100
    : 0;
  const result = evaluateDailyAlerts({
    day:String(day || ''),
    threshold:registration.threshold,
    enabled:registration.enabled !== false,
    holdings,
    portfolioPct,
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