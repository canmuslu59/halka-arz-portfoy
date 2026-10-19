// legacy-webview source=core/notification-rules.js blob=e953ca7205b133af2724b39a0d4ff4c6739fa013 esbuild=0.25.11 target=chrome64 — scripts/build-legacy-webview.mjs üretir, elle düzenlemeyin.
import { bistTickSize, ceilingPrice, floorPrice } from "./ipo-analytics.js";
function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
export function normalizeAlertSettings(input = {}) {
  const enabled = input.enabled !== false;
  const raw = finite(input.threshold, 3);
  const clamped = Math.min(10, Math.max(1, raw));
  const threshold = Math.round(clamped * 2) / 2;
  return { enabled, threshold };
}
export function crossedThresholdLevels(percent, threshold) {
  const pct = finite(percent, 0);
  const step = normalizeAlertSettings({ threshold }).threshold;
  const count = Math.min(100, Math.floor((Math.abs(pct) + 1e-9) / step));
  if (count < 1) return [];
  const sign = pct < 0 ? -1 : 1;
  return Array.from({ length: count }, (_, index) => sign * step * (index + 1));
}
function cleanDelivered(values) {
  return Array.isArray(values) ? values.filter(Number.isFinite) : [];
}
function freshState(day) {
  return { day: String(day || ""), stocks: {}, portfolio: [], limits: {} };
}
export function evaluateDailyAlerts({
  day,
  threshold = 3,
  enabled = true,
  holdings = [],
  portfolioPct = 0,
  previousState = null
} = {}) {
  const settings = normalizeAlertSettings({ threshold, enabled });
  const state = (previousState == null ? void 0 : previousState.day) === day ? {
    day: String(day || ""),
    stocks: {},
    portfolio: cleanDelivered(previousState.portfolio),
    limits: { ...previousState.limits || {} }
  } : freshState(day);
  if (!settings.enabled) return { events: [], state: freshState(day) };
  const events = [];
  for (const holding of Array.isArray(holdings) ? holdings : []) {
    const ticker = String((holding == null ? void 0 : holding.ticker) || "").trim().toUpperCase();
    if (!ticker || (holding == null ? void 0 : holding.dailySessionActive) === false) continue;
    const currentPrice = finite(holding == null ? void 0 : holding.currentPrice, NaN);
    const previousClose = finite(holding == null ? void 0 : holding.previousClose, NaN);
    if (!(currentPrice > 0) || !(previousClose > 0)) continue;
    if ((holding == null ? void 0 : holding.referenceVerified) === false) continue;
    const hasTrustedLimits = (holding == null ? void 0 : holding.referenceVerified) === true && finite(holding == null ? void 0 : holding.ceilingPrice, NaN) > 0 && finite(holding == null ? void 0 : holding.floorPrice, NaN) > 0;
    const ceiling = hasTrustedLimits ? finite(holding.ceilingPrice, NaN) : ceilingPrice(previousClose);
    const floor = hasTrustedLimits ? finite(holding.floorPrice, NaN) : floorPrice(previousClose);
    const ceilingStep = bistTickSize(ceiling) || 0.01;
    const floorStep = bistTickSize(floor) || 0.01;
    const limitState = { ...state.limits[ticker] || {} };
    if (ceiling != null && currentPrice >= ceiling - Math.max(5e-3, ceilingStep / 2 + 1e-8) && !limitState.ceiling) {
      limitState.ceiling = true;
      events.push({ kind: "ceiling", ticker, currentPrice, limitPrice: ceiling, day: String(day || "") });
    }
    if (floor != null && currentPrice <= floor + Math.max(5e-3, floorStep / 2 + 1e-8) && !limitState.floor) {
      limitState.floor = true;
      events.push({ kind: "floor", ticker, currentPrice, limitPrice: floor, day: String(day || "") });
    }
    state.limits[ticker] = limitState;
  }
  const portfolioDelivered = cleanDelivered(state.portfolio);
  const portfolioSet = new Set(portfolioDelivered.map(String));
  for (const level of crossedThresholdLevels(portfolioPct, settings.threshold)) {
    if (portfolioSet.has(String(level))) continue;
    portfolioDelivered.push(level);
    portfolioSet.add(String(level));
    events.push({ kind: "portfolio", level, dailyPct: finite(portfolioPct, 0), day: String(day || "") });
  }
  state.portfolio = portfolioDelivered;
  return { events, state };
}
export function notificationPayloadForEvent(event = {}) {
  const kind = String((event == null ? void 0 : event.kind) || "portfolio");
  const ticker = String((event == null ? void 0 : event.ticker) || "").trim().toUpperCase();
  if (kind === "ceiling") {
    return { kind, ticker, title: `${ticker} tavan yaptı`, body: `${ticker} bugün tavan fiyatına ulaştı.` };
  }
  if (kind === "floor") {
    return { kind, ticker, title: `${ticker} taban yaptı`, body: `${ticker} bugün taban fiyatına ulaştı.` };
  }
  const level = finite(event == null ? void 0 : event.level, 0);
  if (level < 0) return { kind: "portfolio_fall", ticker: "", title: "Portföy düşüşü", body: `Toplam portföy bugün -%${Math.abs(level)} seviyesine düştü.` };
  return { kind: "portfolio", ticker: "", title: "Portföy yükselişi", body: `Toplam portföy bugün +%${Math.abs(level)} seviyesini geçti.` };
}
