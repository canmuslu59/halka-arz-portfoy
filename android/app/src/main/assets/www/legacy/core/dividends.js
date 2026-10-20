// legacy-webview source=core/dividends.js blob=ce5675b81e22b4e62a95089b2990c1c5291440c3 esbuild=0.25.11 target=chrome64 — scripts/build-legacy-webview.mjs üretir, elle düzenlemeyin.
import { calculatePurchaseLedger } from "./purchase-ledger.js";
export const DIVIDEND_TAX_CHANGE_DATE = "2024-12-22";
export const MANUAL_DIVIDEND_LIMIT = 200;
function isoDate(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function shiftDays(date, days) {
  const day = /* @__PURE__ */ new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}
export function dividendWithholdingRate(date) {
  return String(date || "") >= DIVIDEND_TAX_CHANGE_DATE ? 0.15 : 0.1;
}
export function lotsEntitledOn(holding, exDate) {
  const date = isoDate(exDate);
  if (!date) return 0;
  return calculatePurchaseLedger(holding, { throughDate: shiftDays(date, -1) }).currentLots;
}
export function splitFactorAfter(splits, exDate) {
  let factor = 1;
  for (const split of Array.isArray(splits) ? splits : []) {
    if (!(split == null ? void 0 : split.date) || split.date <= exDate) continue;
    const ratio = Number(split.numerator) / Number(split.denominator);
    if (Number.isFinite(ratio) && ratio > 0) factor *= ratio;
  }
  return factor;
}
function dividendSources(holding) {
  const snapshot = (holding == null ? void 0 : holding.historySnapshot) || {};
  const splits = Array.isArray(snapshot.splits) ? snapshot.splits : [];
  const hidden = new Set(Array.isArray(holding == null ? void 0 : holding.hiddenDividends) ? holding.hiddenDividends : []);
  const manual = (Array.isArray(holding == null ? void 0 : holding.manualDividends) ? holding.manualDividends : []).map((entry) => ({ id: String((entry == null ? void 0 : entry.id) || ""), date: isoDate(entry == null ? void 0 : entry.date), perShare: positiveNumber(entry == null ? void 0 : entry.perShare) })).filter((entry) => entry.id && entry.date && entry.perShare != null);
  const manualDates = new Set(manual.map((entry) => entry.date));
  const auto = (Array.isArray(snapshot.dividends) ? snapshot.dividends : []).map((event) => ({ date: isoDate(event == null ? void 0 : event.date), adjusted: positiveNumber(event == null ? void 0 : event.amount) })).filter((event) => event.date && event.adjusted != null).map((event) => {
    const factor = splitFactorAfter(splits, event.date);
    return {
      id: `auto:${event.date}`,
      date: event.date,
      perShare: event.adjusted * factor,
      adjustedPerShare: event.adjusted,
      splitFactor: factor,
      source: "auto"
    };
  }).filter((event) => !hidden.has(event.id) && !manualDates.has(event.date));
  const manualEvents = manual.map((entry) => {
    const factor = splitFactorAfter(splits, entry.date);
    return {
      id: entry.id,
      date: entry.date,
      perShare: entry.perShare,
      adjustedPerShare: entry.perShare / factor,
      splitFactor: factor,
      source: "manual"
    };
  });
  return { events: [...auto, ...manualEvents], hiddenCount: hidden.size };
}
export function holdingDividendPayments(holding, { today = null } = {}) {
  const limit = isoDate(today);
  return dividendSources(holding).events.filter((event) => !limit || event.date <= limit).map((event) => {
    const lots = lotsEntitledOn(holding, event.date);
    const gross = lots * event.adjustedPerShare;
    const rate = dividendWithholdingRate(event.date);
    const tax = gross * rate;
    return {
      ...event,
      holdingId: holding.id,
      ticker: holding.ticker,
      company: holding.company || null,
      lots,
      gross,
      taxRate: rate,
      tax,
      net: gross - tax
    };
  }).filter((payment) => payment.lots > 0).sort((a, b) => b.date.localeCompare(a.date));
}
export function holdingDividendSummary(holding, { today }) {
  const ttmStart = shiftDays(today, -365);
  const payments = holdingDividendPayments(holding, { today });
  const ttmAdjustedPerShare = dividendSources(holding).events.filter((event) => event.date > ttmStart && event.date <= today).reduce((sum, event) => sum + event.adjustedPerShare, 0);
  const currentLots = Number(holding.currentLots || 0);
  const currentPrice = positiveNumber(holding.currentPrice);
  const currentRate = dividendWithholdingRate(today);
  return {
    id: holding.id,
    ticker: holding.ticker,
    company: holding.company || null,
    payments,
    count: payments.length,
    totalGross: payments.reduce((sum, payment) => sum + payment.gross, 0),
    totalNet: payments.reduce((sum, payment) => sum + payment.net, 0),
    lastPayment: payments[0] || null,
    ttmAdjustedPerShare,
    ttmYieldPct: currentPrice && ttmAdjustedPerShare > 0 ? ttmAdjustedPerShare / currentPrice * 100 : null,
    expectedAnnualGross: ttmAdjustedPerShare * currentLots,
    expectedAnnualNet: ttmAdjustedPerShare * currentLots * (1 - currentRate),
    hiddenCount: dividendSources(holding).hiddenCount
  };
}
export function summarizeDividends(holdings, { today }) {
  const ttmStart = shiftDays(today, -365);
  const year = today.slice(0, 4);
  const perHolding = (Array.isArray(holdings) ? holdings : []).map((holding) => holdingDividendSummary(holding, { today }));
  const payments = perHolding.flatMap((item) => item.payments).sort((a, b) => b.date.localeCompare(a.date) || a.ticker.localeCompare(b.ticker));
  const sum = (list, key) => list.reduce((total, item) => total + Number(item[key] || 0), 0);
  const byYearMap = /* @__PURE__ */ new Map();
  for (const payment of payments) {
    const key = payment.date.slice(0, 4);
    const row = byYearMap.get(key) || { year: key, gross: 0, net: 0, count: 0 };
    row.gross += payment.gross;
    row.net += payment.net;
    row.count += 1;
    byYearMap.set(key, row);
  }
  const activeValue = (Array.isArray(holdings) ? holdings : []).reduce((total, holding) => total + (Number(holding.currentLots || 0) > 0 && Number.isFinite(Number(holding.activeValue)) ? Number(holding.activeValue) : 0), 0);
  const expectedAnnualGross = sum(perHolding, "expectedAnnualGross");
  const ttmPayments = payments.filter((payment) => payment.date > ttmStart);
  return {
    payments,
    holdings: perHolding.filter((item) => item.count > 0 || item.ttmAdjustedPerShare > 0).sort((a, b) => b.totalNet - a.totalNet || a.ticker.localeCompare(b.ticker)),
    byYear: [...byYearMap.values()].sort((a, b) => a.year.localeCompare(b.year)),
    count: payments.length,
    totalGross: sum(payments, "gross"),
    totalTax: sum(payments, "tax"),
    totalNet: sum(payments, "net"),
    yearNet: sum(payments.filter((payment) => payment.date.startsWith(year)), "net"),
    ttmNet: sum(ttmPayments, "net"),
    expectedAnnualGross,
    expectedAnnualNet: sum(perHolding, "expectedAnnualNet"),
    yieldPct: activeValue > 0 && expectedAnnualGross > 0 ? expectedAnnualGross / activeValue * 100 : null
  };
}
