import { readFileSync, writeFileSync } from 'node:fs';

const sourceAppPath = 'public/app.js';
const appPath = 'android/app/src/main/assets/www/app.js';
const servicePath = 'android/app/src/main/assets/www/core/portfolio-service.js';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, () => replacement);
}

const sourceApp = readFileSync(sourceAppPath, 'utf8');
let app = readFileSync(appPath, 'utf8');

// The general stock-entry transformation rewrites everything between the add-form
// handler and chartWindow(). Re-insert the chart helper functions after all live
// transformations have completed.
if (!app.includes('function historyFinite(value) {')) {
  const helperStart = sourceApp.indexOf('function historyFinite(value) {');
  const helperEnd = sourceApp.indexOf('function chartWindow()', helperStart);
  const chartStart = app.indexOf('function chartWindow()');
  if (helperStart < 0 || helperEnd < 0 || chartStart < 0) {
    throw new Error('history chart helper boundaries not found');
  }
  const helpers = sourceApp.slice(helperStart, helperEnd);
  app = app.slice(0, chartStart) + helpers + app.slice(chartStart);
}

if (!app.includes("if (value == null || value === '') return null;")) {
  throw new Error('null-safe history helper missing after reinsertion');
}

const addSubmitStart = app.indexOf("$('#addForm').addEventListener('submit', async event => {");
if (addSubmitStart < 0) throw new Error('add form submit handler not found');
const loadAfterAdd = app.indexOf('    await loadPortfolio({ quiet:true });', addSubmitStart);
if (loadAfterAdd < 0) throw new Error('post-add portfolio refresh not found');
const addRefreshNeedle = '    await refreshBackgroundHistory({ force:true });';
const nextHandlerBoundary = app.indexOf('\n});', loadAfterAdd);
if (nextHandlerBoundary < 0) throw new Error('add form submit boundary not found');
const addHandlerTail = app.slice(loadAfterAdd, nextHandlerBoundary);
if (!addHandlerTail.includes(addRefreshNeedle)) {
  const insertAt = loadAfterAdd + '    await loadPortfolio({ quiet:true });'.length;
  app = app.slice(0, insertAt) + '\n' + addRefreshNeedle + app.slice(insertAt);
}
writeFileSync(appPath, app);

let service = readFileSync(servicePath, 'utf8');

const initialHistoryOld = `      historySnapshot: firstTradeDate ? {
        history:Array.isArray(historyResult?.history) ? historyResult.history : (quoteResult.value.history || []),
        fetchedAt:stamp,
        fetchedLocalDate:historyError ? null : localDate,
        startDate:firstTradeDate,
      } : null,`;
const initialHistoryNew = `      historySnapshot: firstTradeDate ? (() => {
        const downloadedHistory = Array.isArray(historyResult?.history) ? historyResult.history : [];
        const quoteHistory = Array.isArray(quoteResult.value?.history) ? quoteResult.value.history : [];
        const resolvedHistory = downloadedHistory.length ? downloadedHistory : quoteHistory;
        return {
          history: resolvedHistory,
          fetchedAt: stamp,
          // Empty daily history is not a successful full-history refresh.
          // Keep recent quote rows visible and retry the full history later.
          fetchedLocalDate: historyError || !downloadedHistory.length ? null : localDate,
          startDate:firstTradeDate,
        };
      })() : null,`;
if (service.includes(initialHistoryOld)) {
  service = replaceOnce(service, initialHistoryOld, initialHistoryNew, 'new holding history fallback');
} else if (!service.includes('const resolvedHistory = downloadedHistory.length ? downloadedHistory : quoteHistory;')) {
  throw new Error('new holding history fallback boundary not found');
}

const refreshOld = `          try {
            const result = await historyFn(nextRaw.ticker, firstTradeDate);
            nextRaw.historySnapshot = {
              history:Array.isArray(result.history) ? result.history : [],
              fetchedAt:now().toISOString(),
              fetchedLocalDate:localDate,
              startDate:firstTradeDate,
            };
          } catch (error) {
            rowErrors.history = messageOf(error, 'Geçmiş fiyat verisi alınamadı.');
          }`;
const refreshNew = `          try {
            const result = await historyFn(nextRaw.ticker, firstTradeDate);
            const downloadedHistory = Array.isArray(result?.history) ? result.history : [];
            const existingHistory = Array.isArray(nextRaw.historySnapshot?.history) ? nextRaw.historySnapshot.history : [];
            const quoteHistory = Array.isArray(nextRaw.quoteSnapshot?.history) ? nextRaw.quoteSnapshot.history : [];
            const fallbackHistory = existingHistory.length ? existingHistory : quoteHistory;
            nextRaw.historySnapshot = {
              history: downloadedHistory.length ? downloadedHistory : fallbackHistory,
              fetchedAt:now().toISOString(),
              // Never cache an empty upstream response as a complete daily history.
              fetchedLocalDate:downloadedHistory.length ? localDate : null,
              startDate:firstTradeDate,
            };
            if (!downloadedHistory.length) {
              rowErrors.history = 'Tam geçmiş fiyat kaynağı boş döndü; mevcut fiyat geçmişi kullanılıyor.';
            }
          } catch (error) {
            const existingHistory = Array.isArray(nextRaw.historySnapshot?.history) ? nextRaw.historySnapshot.history : [];
            const quoteHistory = Array.isArray(nextRaw.quoteSnapshot?.history) ? nextRaw.quoteSnapshot.history : [];
            if (!existingHistory.length && quoteHistory.length) {
              nextRaw.historySnapshot = {
                history:quoteHistory,
                fetchedAt:now().toISOString(),
                fetchedLocalDate:null,
                startDate:firstTradeDate,
              };
            }
            rowErrors.history = messageOf(error, 'Geçmiş fiyat verisi alınamadı.');
          }`;
if (service.includes(refreshOld)) {
  service = replaceOnce(service, refreshOld, refreshNew, 'history refresh fallback');
} else if (!service.includes("Tam geçmiş fiyat kaynağı boş döndü; mevcut fiyat geçmişi kullanılıyor.")) {
  throw new Error('history refresh fallback boundary not found');
}

writeFileSync(servicePath, service);

console.log('Reinserted chart helpers and applied guaranteed portfolio-history refresh/fallback.');
