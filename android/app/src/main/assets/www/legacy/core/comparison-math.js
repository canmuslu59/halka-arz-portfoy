// legacy-webview source=core/comparison-math.js blob=d002e0975adda055e44278840fc268922e756e33 esbuild=0.25.11 target=chrome64 — scripts/build-legacy-webview.mjs üretir, elle düzenlemeyin.
function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function isoDateFromIstanbulInstant(value) {
  const stamp = Number(value);
  if (!Number.isFinite(stamp)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(stamp * 1e3));
  const pick = (type) => {
    var _a;
    return (_a = parts.find((part) => part.type === type)) == null ? void 0 : _a.value;
  };
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}
export function comparisonSeriesFromYahoo(json) {
  var _a, _b, _c, _d, _e;
  const result = (_b = (_a = json == null ? void 0 : json.chart) == null ? void 0 : _a.result) == null ? void 0 : _b[0];
  const timestamps = Array.isArray(result == null ? void 0 : result.timestamp) ? result.timestamp : [];
  const closes = Array.isArray((_e = (_d = (_c = result == null ? void 0 : result.indicators) == null ? void 0 : _c.quote) == null ? void 0 : _d[0]) == null ? void 0 : _e.close) ? result.indicators.quote[0].close : [];
  const byDate = /* @__PURE__ */ new Map();
  const count = Math.min(timestamps.length, closes.length);
  for (let index = 0; index < count; index += 1) {
    const date = isoDateFromIstanbulInstant(timestamps[index]);
    const close = finitePositive(closes[index]);
    if (!date || close == null) continue;
    byDate.set(date, { date, close });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function comparisonWindowFromBist(series, range, {
  today,
  sessions = { daily: 1, weekly: 5, monthly: 22 }
} = {}) {
  const day = String(today || "");
  const rows = (Array.isArray(series) ? series : []).filter((row) => (row == null ? void 0 : row.date) && finitePositive(row == null ? void 0 : row.close) != null && (!day || row.date <= day)).slice().sort((a, b) => a.date.localeCompare(b.date));
  const sessionCount = Number(sessions == null ? void 0 : sessions[range]);
  if (!Number.isFinite(sessionCount) || sessionCount < 1 || rows.length <= sessionCount) return null;
  const end = rows[rows.length - 1];
  const start = rows[rows.length - 1 - sessionCount];
  return {
    range,
    startDate: start.date,
    endDate: end.date,
    sessionActive: range === "daily" ? Boolean(day && end.date === day) : true
  };
}
export function percentageMoveBetweenDates(series, startDate, endDate) {
  const rows = Array.isArray(series) ? series : [];
  const start = rows.find((row) => (row == null ? void 0 : row.date) === startDate);
  const end = rows.find((row) => (row == null ? void 0 : row.date) === endDate);
  const startValue = finitePositive(start == null ? void 0 : start.close);
  const endValue = finitePositive(end == null ? void 0 : end.close);
  if (startValue == null || endValue == null) return null;
  return (endValue / startValue - 1) * 100;
}
export function combinedPercentageMoveBetweenDates(firstSeries, secondSeries, startDate, endDate) {
  var _a, _b, _c, _d;
  const firstStart = finitePositive((_a = (Array.isArray(firstSeries) ? firstSeries : []).find((row) => (row == null ? void 0 : row.date) === startDate)) == null ? void 0 : _a.close);
  const firstEnd = finitePositive((_b = (Array.isArray(firstSeries) ? firstSeries : []).find((row) => (row == null ? void 0 : row.date) === endDate)) == null ? void 0 : _b.close);
  const secondStart = finitePositive((_c = (Array.isArray(secondSeries) ? secondSeries : []).find((row) => (row == null ? void 0 : row.date) === startDate)) == null ? void 0 : _c.close);
  const secondEnd = finitePositive((_d = (Array.isArray(secondSeries) ? secondSeries : []).find((row) => (row == null ? void 0 : row.date) === endDate)) == null ? void 0 : _d.close);
  if ([firstStart, firstEnd, secondStart, secondEnd].some((value) => value == null)) return null;
  const startCombined = firstStart * secondStart;
  const endCombined = firstEnd * secondEnd;
  return (endCombined / startCombined - 1) * 100;
}
export function compoundedPortfolioMove(history, startDate, endDate) {
  if (!startDate || !endDate || startDate >= endDate) return null;
  const rows = (Array.isArray(history) ? history : []).filter((row) => row == null ? void 0 : row.date).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const hasStart = rows.some((row) => row.date === startDate && row.complete !== false && finitePositive(row.value) != null);
  const hasEnd = rows.some((row) => row.date === endDate && row.complete !== false && finitePositive(row.value) != null);
  if (!hasStart || !hasEnd) return null;
  const periodRows = rows.filter((row) => row.date > startDate && row.date <= endDate);
  if (!periodRows.length) return null;
  if (periodRows.some((row) => row.complete === false || row.dailyPct == null || !Number.isFinite(Number(row.dailyPct)))) {
    return null;
  }
  let factor = 1;
  for (const row of periodRows) factor *= 1 + Number(row.dailyPct) / 100;
  return (factor - 1) * 100;
}
