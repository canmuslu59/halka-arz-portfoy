import { readFileSync, writeFileSync } from 'node:fs';

const appPath = 'android/app/src/main/assets/www/app.js';
let app = readFileSync(appPath, 'utf8');

const loadMarker = 'async function loadPopularFinanceNews({ force = false } = {}) {';
if (!app.includes(loadMarker)) {
  throw new Error('finance news loader marker not found');
}
if (app.includes('async function fetchPopularFinanceNewsPayload()')) {
  throw new Error('finance news fallback already applied');
}

const helper = `async function fetchPopularFinanceNewsPayload() {
  try {
    return await httpGetJson(NEWS_FEED_URL);
  } catch (nativeError) {
    try {
      const response = await fetch(NEWS_FEED_URL, {
        method:'GET',
        cache:'no-store',
        headers:{ accept:'application/json' },
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } catch (fetchError) {
      const nativeMessage = nativeError instanceof Error ? nativeError.message : String(nativeError || 'Android ağ isteği başarısız');
      const fetchMessage = fetchError instanceof Error ? fetchError.message : String(fetchError || 'WebView ağ isteği başarısız');
      throw new Error('Haberler alınamadı: ' + nativeMessage + ' / ' + fetchMessage);
    }
  }
}

`;

app = app.replace(loadMarker, helper + loadMarker);

const requestNeedle = '  const task = httpGetJson(NEWS_FEED_URL)';
if (!app.includes(requestNeedle)) {
  throw new Error('finance news request marker not found');
}
app = app.replace(requestNeedle, '  const task = fetchPopularFinanceNewsPayload()');

const catchNeedle = `    .catch(error => {
      if (status) status.textContent = 'Haberler alınamadı · Yenile ile tekrar deneyin';`;
if (!app.includes(catchNeedle)) {
  throw new Error('finance news error status marker not found');
}
app = app.replace(
  catchNeedle,
  `    .catch(error => {
      const reason = String(error?.message || 'Ağ hatası').slice(0, 120);
      if (status) status.textContent = 'Haberler alınamadı · ' + reason;`
);

writeFileSync(appPath, app);
console.log('Applied finance-news native-to-WebView fetch fallback.');
