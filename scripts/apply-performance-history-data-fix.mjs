import { readFileSync, writeFileSync } from 'node:fs';

const appPath = 'android/app/src/main/assets/www/app.js';
const servicePath = 'android/app/src/main/assets/www/core/portfolio-service.js';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, () => replacement);
}

let app = readFileSync(appPath, 'utf8');
app = replaceOnce(
  app,
  `function historyFinite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}`,
  `function historyFinite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}`,
  'null-safe history number',
);

app = replaceOnce(
  app,
  `    await loadPortfolio({ quiet:true });
    toast(result.merged ? \`${result.holding.ticker} alımı mevcut pozisyona eklendi.\` : \`${result.holding.ticker} hissesi eklendi.\`);`,
  `    await loadPortfolio({ quiet:true });
    await refreshBackgroundHistory({ force:true });
    toast(result.merged ? \`${result.holding.ticker} alımı mevcut pozisyona eklendi.\` : \`${result.holding.ticker} hissesi eklendi.\`);`,
  'force history refresh after purchase',
);
writeFileSync(appPath, app);

let service = readFileSync(servicePath, 'utf8');
service = replaceOnce(
  service,
  `      historySnapshot: firstTradeDate ? {
        history:Array.isArray(historyResult?.history) ? historyResult.history : (quoteResult.value.history || []),
        fetchedAt:stamp,
        fetchedLocalDate:historyError ? null : localDate,
        startDate:firstTradeDate,
      } : null,`,
  `      historySnapshot: firstTradeDate ? (() => {
        const downloadedHistory = Array.isArray(historyResult?.history) ? historyResult.history : [];
        const quoteHistory = Array.isArray(quoteResult.value?.history) ? quoteResult.value.history : [];
        const resolvedHistory = downloadedHistory.length ? downloadedHistory : quoteHistory;
        return {
          history: resolvedHistory,
          fetchedAt: stamp,
          // An empty daily response must not be treated as a complete/fresh history.
          // Keep the recent quote rows for the chart and retry full history later.
          fetchedLocalDate: historyError || !downloadedHistory.length ? null : localDate,
          startDate:firstTradeDate,
        };
      })() : null,`,
  'new holding history fallback',
);

service = replaceOnce(
  service,
  `          try {
            const result = await historyFn(nextRaw.ticker, firstTradeDate);
            nextRaw.historySnapshot = {
              history:Array.isArray(result.history) ? result.history : [],
              fetchedAt:now().toISOString(),
              fetchedLocalDate:localDate,
              startDate:firstTradeDate,
            };
          } catch (error) {
            rowErrors.history = messageOf(error, 'Geçmiş fiyat verisi alınamadı.');
          }`,
  `          try {
            const result = await historyFn(nextRaw.ticker, firstTradeDate);
            const downloadedHistory = Array.isArray(result?.history) ? result.history : [];
            const existingHistory = Array.isArray(nextRaw.historySnapshot?.history) ? nextRaw.historySnapshot.history : [];
            const quoteHistory = Array.isArray(nextRaw.quoteSnapshot?.history) ? nextRaw.quoteSnapshot.history : [];
            const fallbackHistory = existingHistory.length ? existingHistory : quoteHistory;
            nextRaw.historySnapshot = {
              history: downloadedHistory.length ? downloadedHistory : fallbackHistory,
              fetchedAt:now().toISOString(),
              // Do not cache an empty upstream response as a successful full-history refresh.
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
          }`,
  'history refresh fallback',
);
writeFileSync(servicePath, service);

console.log('Applied guaranteed post-purchase history refresh and non-destructive history fallback.');
