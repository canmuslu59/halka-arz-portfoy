import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, content) { fs.writeFileSync(path, content); }
function replaceOne(path, before, after) {
  const source = read(path);
  if (!source.includes(before)) throw new Error(`Expected source not found in ${path}: ${before.slice(0,120)}`);
  const next = source.replace(before, after);
  if (next === source) throw new Error(`Replacement made no change in ${path}`);
  write(path, next);
}
function appendOnce(path, marker, content) {
  const source = read(path);
  if (source.includes(marker)) return;
  write(path, `${source.trimEnd()}\n\n${content.trim()}\n`);
}

// 1) Future-dated sales must not mutate today's portfolio.
replaceOne(
  'public/core/portfolio-service.js',
  "    const saleDate = optionalIsoDate(date || dateInIstanbul(now()), 'Satış tarihi');\n    const stamp = now().toISOString();",
  "    const saleDate = optionalIsoDate(date || dateInIstanbul(now()), 'Satış tarihi');\n    if (saleDate > dateInIstanbul(now())) throw new Error('Satış tarihi gelecekte olamaz.');\n    const stamp = now().toISOString();",
);

// 2) Offer ranges that cross New Year belong to two different years.
replaceOne(
  'public/core/ipo-service.js',
  "    if (firstMonth && secondMonth) return { start:iso(match[5], firstMonth, match[1]), end:iso(match[5], secondMonth, match[3]) };",
  "    if (firstMonth && secondMonth) {\n      const endYear = Number(match[5]);\n      const startYear = firstMonth > secondMonth ? endYear - 1 : endYear;\n      return { start:iso(startYear, firstMonth, match[1]), end:iso(endYear, secondMonth, match[3]) };\n    }",
);

// 3) 2027 Turkish religious holidays / half-days.
replaceOne(
  'public/core/market-calendar.js',
  "const CLOSED_2026 = new Set(['2026-03-20','2026-03-21','2026-03-22','2026-05-27','2026-05-28','2026-05-29','2026-05-30']);\nconst HALF_2026 = new Set(['2026-03-19','2026-05-26','2026-10-28']);",
  "const CLOSED_2026 = new Set(['2026-03-20','2026-03-21','2026-03-22','2026-05-27','2026-05-28','2026-05-29','2026-05-30']);\nconst CLOSED_2027 = new Set(['2027-03-09','2027-03-10','2027-03-11','2027-05-16','2027-05-17','2027-05-18','2027-05-19']);\nconst HALF_2026 = new Set(['2026-03-19','2026-05-26','2026-10-28']);\nconst HALF_2027 = new Set(['2027-03-08','2027-05-15']);",
);
replaceOne(
  'public/core/market-calendar.js',
  "  return FIXED_CLOSED.has(iso.slice(5)) || CLOSED_2026.has(iso);",
  "  return FIXED_CLOSED.has(iso.slice(5)) || CLOSED_2026.has(iso) || CLOSED_2027.has(iso);",
);
replaceOne(
  'public/core/market-calendar.js',
  "  return HALF_2026.has(iso) || iso.slice(5) === '10-28';",
  "  return HALF_2026.has(iso) || HALF_2027.has(iso) || iso.slice(5) === '10-28';",
);

// 4) Calendar auto-refresh must bypass its own loaded-state shortcut.
replaceOne(
  'public/app.js',
  "setInterval(() => { if (!document.hidden && state.view === 'calendar') loadIpoCalendar(); }, 300_000);",
  "setInterval(() => { if (!document.hidden && state.view === 'calendar') loadIpoCalendar({ force:true }); }, 300_000);",
);

// 5) Foreground notification delivery state is committed only when native delivery succeeds.
replaceOne(
  'android/app/src/main/java/com/innative/halkaarz/MainActivity.java',
  `        @JavascriptInterface\n        public void showLocalNotification(String json) {\n            try {\n                JSONObject parsed = new JSONObject(json == null ? "{}" : json);\n                Map<String, String> data = new HashMap<>();\n                data.put("kind", parsed.optString("kind", "portfolio"));\n                data.put("ticker", parsed.optString("ticker", ""));\n                data.put("title", parsed.optString("title", "Halka Arz Portföyüm"));\n                data.put("body", parsed.optString("body", "Portföyünüzde yeni bir hareket var."));\n                NotificationHelper.show(activity, data);\n            } catch (Exception ignored) {}\n        }`,
  `        @JavascriptInterface\n        public boolean showLocalNotification(String json) {\n            try {\n                JSONObject parsed = new JSONObject(json == null ? "{}" : json);\n                Map<String, String> data = new HashMap<>();\n                data.put("kind", parsed.optString("kind", "portfolio"));\n                data.put("ticker", parsed.optString("ticker", ""));\n                data.put("title", parsed.optString("title", "Halka Arz Portföyüm"));\n                data.put("body", parsed.optString("body", "Portföyünüzde yeni bir hareket var."));\n                return NotificationHelper.show(activity, data);\n            } catch (Exception ignored) {\n                return false;\n            }\n        }`,
);
replaceOne(
  'public/app.js',
  `  safeSetLocal(LOCAL_ALERT_STATE_KEY, JSON.stringify(result.state));\n  for (const event of result.events) {\n    const payload = notificationPayloadForEvent(event);\n    try { window.AndroidBridge?.showLocalNotification?.(JSON.stringify(payload)); } catch {}\n  }`,
  `  let deliveredCount = 0;\n  for (const event of result.events) {\n    const payload = notificationPayloadForEvent(event);\n    try {\n      if (window.AndroidBridge?.showLocalNotification?.(JSON.stringify(payload))) deliveredCount += 1;\n    } catch {}\n  }\n  if (result.events.length === 0 || deliveredCount === result.events.length) {\n    safeSetLocal(LOCAL_ALERT_STATE_KEY, JSON.stringify(result.state));\n  }`,
);

// 6) IPO push deep-link should focus the target card and clear the pending focus after use.
replaceOne(
  'public/app.js',
  `  list.innerHTML = items.map(item => \`\n    <article class="calendar-card">`,
  `  list.innerHTML = items.map(item => \`\n    <article class="calendar-card" data-ipo-ticker="\${esc(item.ticker)}">`,
);
replaceOne(
  'public/app.js',
  `  \`).join('');\n  $$('[data-pro-ticker]', list).forEach(button => button.addEventListener('click', () => switchView('pro', { selectedTicker:button.dataset.proTicker })));`,
  `  \`).join('');\n  const focusTicker = String(safeGetLocal('pushFocusIpo') || '').toUpperCase();\n  if (focusTicker) {\n    const target = [...list.querySelectorAll('[data-ipo-ticker]')].find(card => String(card.dataset.ipoTicker || '').toUpperCase() === focusTicker);\n    if (target) {\n      safeSetLocal('pushFocusIpo', '');\n      setTimeout(() => target.scrollIntoView({ behavior:'smooth', block:'center' }), 0);\n    }\n  }\n  $$('[data-pro-ticker]', list).forEach(button => button.addEventListener('click', () => switchView('pro', { selectedTicker:button.dataset.proTicker })));`,
);
replaceOne(
  'public/app.js',
  `  if (kind === 'ipo') {\n    switchView('calendar');\n    if (ticker) safeSetLocal('pushFocusIpo', ticker);\n    return;\n  }`,
  `  if (kind === 'ipo') {\n    if (ticker) safeSetLocal('pushFocusIpo', ticker);\n    switchView('calendar');\n    return;\n  }`,
);

// 7) Review access should expire after 24 hours instead of becoming a permanent local unlock.
replaceOne(
  'public/core/pro-access.js',
  "export const DEFAULT_TRIAL_MS = 7 * 24 * 60 * 60 * 1000;\nexport const REVIEW_ACCESS_CODE = 'GPLAY-REVIEW-HA11-2026';",
  "export const DEFAULT_TRIAL_MS = 7 * 24 * 60 * 60 * 1000;\nexport const REVIEW_ACCESS_MS = 24 * 60 * 60 * 1000;\nexport const REVIEW_ACCESS_CODE = 'GPLAY-REVIEW-HA11-2026';",
);
replaceOne(
  'public/core/pro-access.js',
  `  function hasReviewAccess() {\n    return storage.getItem(REVIEW_KEY) === '1';\n  }`,
  `  function hasReviewAccess() {\n    const grantedAt = asFiniteTimestamp(storage.getItem(REVIEW_KEY));\n    return Boolean(grantedAt && Math.max(0, now() - grantedAt) < REVIEW_ACCESS_MS);\n  }`,
);
replaceOne(
  'public/core/pro-access.js',
  `    storage.setItem(REVIEW_KEY, '1');`,
  `    storage.setItem(REVIEW_KEY, String(now()));`,
);

// 8) Package a truthful in-app privacy policy and complete offline module list.
const privacy = `<!doctype html>\n<html lang="tr">\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n  <meta name="theme-color" content="#0b1020" />\n  <title>Gizlilik Politikası • Halka Arz Portföyüm</title>\n  <link rel="stylesheet" href="./styles.css" />\n</head>\n<body>\n  <main class="shell main">\n    <section class="settings-card" style="margin-top:24px">\n      <div><span class="eyebrow">GİZLİLİK</span><h1>Gizlilik Politikası</h1></div>\n      <p>Halka Arz Portföyüm, portföy kayıtlarınızı öncelikle cihazınızda saklar. Uygulama; eklediğiniz hisse kodları, lot ve satış kayıtları gibi portföy bilgilerini uygulama işlevlerini sunmak için işler.</p>\n      <h2>Bildirimler</h2>\n      <p>Bildirim özelliği açıksa bildirim tercihleri ve aktif portföydeki hisse kodu/lot bilgileri cihaz üzerinde arka plan kontrollerinde kullanılabilir. Uzaktan bildirim altyapısı yapılandırılmış bir sürümde cihaz kurulum kimliği, Firebase bildirim belirteci ve bildirim yapılandırması HTTPS üzerinden bildirim hizmetine gönderilebilir.</p>\n      <h2>Piyasa verileri</h2>\n      <p>Fiyat, halka arz ve şirket bilgilerini göstermek için üçüncü taraf piyasa/veri kaynaklarına ağ istekleri yapılır. Bu isteklerde ilgili hizmetlerin teknik olarak aldığı IP adresi ve bağlantı bilgileri kendi politikalarına tabi olabilir.</p>\n      <h2>Saklama ve kontrol</h2>\n      <p>Yerel portföy verileri uygulamanın özel depolama alanında tutulur. Uygulamayı kaldırmanız cihazdaki bu yerel verileri silebilir. Bildirim iznini Android ayarlarından kapatabilir ve uygulama içindeki bildirim tercihlerini değiştirebilirsiniz.</p>\n      <h2>Finansal bilgilendirme</h2>\n      <p>Uygulamadaki bilgiler portföy takibi amacı taşır ve yatırım tavsiyesi değildir. Piyasa verileri gecikmeli veya eksik olabilir.</p>\n      <p><a href="./index.html">Uygulamaya dön</a></p>\n      <small>Son güncelleme: 11 Eylül 2026</small>\n    </section>\n  </main>\n</body>\n</html>\n`;
write('public/privacy.html', privacy);

replaceOne(
  'public/sw.js',
  "const CACHE = 'halka-arz-portfoy-v5';",
  "const CACHE = 'halka-arz-portfoy-v6';",
);
replaceOne(
  'public/sw.js',
  "  './styles.css', './app.js', './icon.svg', './manifest.webmanifest',",
  "  './styles.css', './app.js', './icon.svg', './manifest.webmanifest', './privacy.html',",
);
replaceOne(
  'public/sw.js',
  "  './core/http.js', './core/data-sources.js', './core/parsers.js', './core/domain.js',",
  "  './core/http.js', './core/data-sources.js', './core/gedik-calendar.js', './core/parsers.js', './core/domain.js',",
);

// 9) Code23 release identity.
replaceOne('android/app/build.gradle', '        versionCode 22\n        versionName \'2.4.0\'', '        versionCode 23\n        versionName \'2.4.1\'');
replaceOne('public/index.html', 'v2.4.0 • Build 22', 'v2.4.1 • Build 23');
replaceOne(
  'test/release-identity.test.js',
  "test('Google Play release candidate advances to versionCode 22 / versionName 2.4.0', async () => {",
  "test('Google Play release candidate advances to versionCode 23 / versionName 2.4.1', async () => {",
);
replaceOne('test/release-identity.test.js', 'assert.match(gradle, /versionCode 22/);', 'assert.match(gradle, /versionCode 23/);');
replaceOne('test/release-identity.test.js', "assert.match(gradle, /versionName ['\"]2\\.4\\.0['\"]/);", "assert.match(gradle, /versionName ['\"]2\\.4\\.1['\"]/);");
replaceOne('test/release-identity.test.js', 'assert.match(index, /id="appVersion"[\\s\\S]*v2\\.4\\.0\\s*•\\s*Build 22/);', 'assert.match(index, /id="appVersion"[\\s\\S]*v2\\.4\\.1\\s*•\\s*Build 23/);');

// 10) Lock in Activity-independent background notification behavior.
appendOnce(
  'test/android-notification-background-behavior.test.js',
  "background alert worker stays independent of MainActivity and WebView",
  `test('background alert worker stays independent of MainActivity and WebView', async () => {\n  const scheduler = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java');\n  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');\n  assert.match(scheduler, /PeriodicWorkRequest\\.Builder\\(BackgroundAlertWorker\\.class, 15, TimeUnit\\.MINUTES\\)/);\n  assert.match(scheduler, /enqueueUniquePeriodicWork/);\n  assert.match(worker, /NotificationHelper\\.show\\(context, data\\)/);\n  assert.doesNotMatch(worker, /MainActivity|WebView/);\n});`,
);

console.log('Code23 fixes applied.');
