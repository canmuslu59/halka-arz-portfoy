import { readFileSync, writeFileSync } from 'node:fs';

const appPath = 'android/app/src/main/assets/www/app.js';
const policyPath = 'android/app/src/main/java/com/innative/halkaarz/NativeHttpPolicy.java';
const AA_FINANCE_URL = 'https://www.aa.com.tr/tr/ekonomi';

let app = readFileSync(appPath, 'utf8');

const loadMarker = 'async function loadPopularFinanceNews({ force = false } = {}) {';
if (!app.includes(loadMarker)) {
  throw new Error('finance news loader marker not found');
}
if (app.includes('async function fetchPopularFinanceNewsPayload()')) {
  throw new Error('finance news fallback already applied');
}

const helper = `const AA_FINANCE_URL = '${AA_FINANCE_URL}';
let financeNewsLastError = '';

function validateFinanceNewsPayload(payload, label) {
  if (!payload || !Array.isArray(payload.items) || payload.items.length < 1) {
    throw new Error(label + ' boş haber listesi döndürdü.');
  }
  return payload;
}

function inferAaFinanceCategory(title) {
  const text = String(title || '').toLocaleLowerCase('tr-TR');
  if (/halka arz|arz talep|borsada işlem/.test(text)) return 'halka-arz';
  if (/borsa|bist|hisse|endeks|spk|borsa istanbul/.test(text)) return 'borsa';
  if (/altın|gram altın|ons/.test(text)) return 'altin';
  if (/dolar|euro|avro|döviz|kur |kurun|sterlin/.test(text)) return 'doviz';
  if (/şirket|holding|banka|bankacılık|firma|sanayi|otomobil|otomotiv/.test(text)) return 'sirketler';
  return 'ekonomi';
}

function parseAaFinanceFallback(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html || ''), 'text/html');
  const seen = new Set();
  const items = [];
  for (const anchor of doc.querySelectorAll('a[href]')) {
    const href = String(anchor.getAttribute('href') || '').trim();
    if (!href.includes('/tr/ekonomi/')) continue;
    const title = String(anchor.textContent || '').replace(/\\s+/g, ' ').trim();
    if (title.length < 20) continue;
    let url;
    try { url = new URL(href, 'https://www.aa.com.tr').href; }
    catch { continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({
      id: 'aa:' + url,
      source: 'Anadolu Ajansı',
      title,
      url,
      category: inferAaFinanceCategory(title),
      publishedAt: null,
    });
    if (items.length >= 30) break;
  }
  return { items, fetchedAt: new Date().toISOString(), partial: true, fallback: 'aa-ekonomi' };
}

async function fetchAaFinanceFallback() {
  const html = await httpGetText(AA_FINANCE_URL);
  return validateFinanceNewsPayload(parseAaFinanceFallback(html), 'AA Ekonomi');
}

async function fetchPopularFinanceNewsPayload() {
  let nativeMessage = '';
  let fetchMessage = '';
  try {
    return validateFinanceNewsPayload(await httpGetJson(NEWS_FEED_URL), 'Finans servisi');
  } catch (nativeError) {
    nativeMessage = nativeError instanceof Error ? nativeError.message : String(nativeError || 'Android ağ isteği başarısız');
  }

  try {
    const response = await fetch(NEWS_FEED_URL, {
      method:'GET',
      cache:'no-store',
      headers:{ accept:'application/json' },
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return validateFinanceNewsPayload(await response.json(), 'WebView finans servisi');
  } catch (fetchError) {
    fetchMessage = fetchError instanceof Error ? fetchError.message : String(fetchError || 'WebView ağ isteği başarısız');
  }

  try {
    return await fetchAaFinanceFallback();
  } catch (aaError) {
    const aaMessage = aaError instanceof Error ? aaError.message : String(aaError || 'AA ekonomi isteği başarısız');
    throw new Error('Worker(native): ' + nativeMessage + ' / Worker(web): ' + fetchMessage + ' / AA: ' + aaMessage);
  }
}

`;

app = app.replace(loadMarker, helper + loadMarker);

const requestNeedle = '  const task = httpGetJson(NEWS_FEED_URL)';
if (!app.includes(requestNeedle)) {
  throw new Error('finance news request marker not found');
}
app = app.replace(requestNeedle, '  const task = fetchPopularFinanceNewsPayload()');

const thenNeedle = `    .then(payload => {\n      popularFinanceNewsItems = financeNewsItemsOnly(payload?.items);`;
if (!app.includes(thenNeedle)) {
  throw new Error('finance news success marker not found');
}
app = app.replace(
  thenNeedle,
  `    .then(payload => {\n      financeNewsLastError = '';\n      popularFinanceNewsItems = financeNewsItemsOnly(payload?.items);`
);

const catchNeedle = `    .catch(error => {\n      if (status) status.textContent = 'Haberler alınamadı · Yenile ile tekrar deneyin';`;
if (!app.includes(catchNeedle)) {
  throw new Error('finance news error status marker not found');
}
app = app.replace(
  catchNeedle,
  `    .catch(error => {\n      const reason = String(error?.message || 'Ağ hatası').slice(0, 240);\n      financeNewsLastError = 'Haberler alınamadı · ' + reason;\n      if (status) status.textContent = financeNewsLastError;`
);

const emptyNeedle = `    rail.innerHTML = '<div class="finance-news-empty">Finans haberleri şu anda görüntülenemiyor. Biraz sonra tekrar deneyin.</div>';`;
if (!app.includes(emptyNeedle)) {
  throw new Error('finance news empty-state marker not found');
}
app = app.replace(
  emptyNeedle,
  `    rail.innerHTML = '<div class="finance-news-empty">' + esc(financeNewsLastError || 'Finans haberleri şu anda görüntülenemiyor. Biraz sonra tekrar deneyin.') + '</div>';`
);

const emptyStatusNeedle = `    status.textContent = 'Haber akışı bekleniyor';`;
if (!app.includes(emptyStatusNeedle)) {
  throw new Error('finance news empty status marker not found');
}
app = app.replace(
  emptyStatusNeedle,
  `    status.textContent = financeNewsLastError || 'Haber akışı bekleniyor';`
);

writeFileSync(appPath, app);

let policy = readFileSync(policyPath, 'utf8');
const workerHostNeedle = `            "halka-arz-portfoy-news-test.grass-airboat.workers.dev"`;
if (!policy.includes(workerHostNeedle)) {
  throw new Error('finance news worker allowlist marker not found');
}
if (!policy.includes('"www.aa.com.tr"')) {
  policy = policy.replace(
    workerHostNeedle,
    `${workerHostNeedle},\n            "aa.com.tr",\n            "www.aa.com.tr"`
  );
}
writeFileSync(policyPath, policy);

console.log('Applied three-stage finance-news fallback with direct AA Economy source and visible diagnostics without fabricated timestamps.');
