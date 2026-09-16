import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const indexPath = 'android/app/src/main/assets/www/index.html';
const appPath = 'android/app/src/main/assets/www/app.js';
const stylesPath = 'android/app/src/main/assets/www/styles.css';
const activityPath = 'android/app/src/main/java/com/innative/halkaarz/MainActivity.java';
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const sharePathsPath = 'android/app/src/main/res/xml/share_file_paths.xml';
const launcherSource = 'android/app/src/main/res/drawable-nodpi/ic_launcher.webp';
const launcherTarget = 'android/app/src/main/assets/www/launcher-icon.webp';
const providerAuthority = '${applicationId}.fileprovider';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, replacement);
}

let index = readFileSync(indexPath, 'utf8');
index = replaceOnce(index, 'src="./icon.svg"', 'src="./launcher-icon.webp"', 'launcher artwork');
index = replaceOnce(
  index,
  '<section class="hero-card" aria-labelledby="portfolioValueLabel">',
  '<section id="portfolioHeroCard" class="hero-card wallet-home-card" aria-label="Cüzdan">',
  'wallet card identity'
);
index = replaceOnce(
  index,
  `      <div class="hero-topline">\n        <span id="portfolioValueLabel" class="muted">Toplam portföy büyüklüğü</span>\n        <span id="lastUpdated" class="status-dot">—</span>\n      </div>`,
  `      <div class="hero-topline hero-topline-actions">\n        <span class="wallet-title">Cüzdan</span>\n        <button id="sharePortfolioBtn" class="icon-btn share-btn" type="button" aria-label="Portföy kartını görsel olarak paylaş" title="Paylaş">\n          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5"/><path d="M8 9l4-4 4 4"/><path d="M5 13v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>\n        </button>\n      </div>`,
  'wallet share action'
);
index = replaceOnce(
  index,
  `    </section>\n\n    <section class="chart-card">`,
  `    </section>\n\n    <section id="comparisonCard" class="comparison-card" aria-label="Günlük karşılaştırma">\n      <div class="comparison-head">\n        <div><span class="eyebrow">KARŞILAŞTIRMA</span><strong>Günlük karşılaştırma</strong></div>\n        <small id="comparisonStatus" class="muted">Referanslar yükleniyor…</small>\n      </div>\n      <div class="comparison-grid">\n        <div class="comparison-item portfolio"><span>Portföy</span><strong id="comparisonPortfolio">—</strong></div>\n        <div class="comparison-item"><span>Altın (TL)</span><strong id="comparisonGold">—</strong></div>\n        <div class="comparison-item"><span>BIST 100</span><strong id="comparisonBist">—</strong></div>\n        <div class="comparison-item"><span>Dolar</span><strong id="comparisonUsd">—</strong></div>\n      </div>\n      <div id="comparisonSummary" class="comparison-summary">Günlük referanslar hazırlanıyor.</div>\n    </section>\n\n    <section class="chart-card">`,
  'comparison card insertion'
);
writeFileSync(indexPath, index);

let styles = readFileSync(stylesPath, 'utf8');
styles += `\n\n/* Isolated test-only compact wallet + comparison + image share UI. */\n.topbar-logo{display:block;width:44px;height:44px;border-radius:12px;object-fit:cover}\n.wallet-home-card{padding:18px 20px 16px}\n.hero-topline-actions{justify-content:space-between;gap:12px;margin-bottom:2px}\n.wallet-title{font-size:12px;line-height:1.2;letter-spacing:.15em;font-weight:850;color:#91a0b6;text-transform:uppercase}\n.share-btn{position:relative;z-index:3;flex:0 0 auto}\n.wallet-home-card .hero-value{margin:6px 0 8px}\n.wallet-home-card .hero-grid{margin-top:15px;padding-top:14px;gap:10px}\n.hero-card.share-capture .share-btn{visibility:hidden!important}\nbody.share-capture-active .bottom-nav,body.share-capture-active .fab{visibility:hidden!important}\n.comparison-card{border:1px solid var(--line);background:linear-gradient(160deg,rgba(20,29,52,.90),rgba(10,16,30,.92));box-shadow:0 16px 44px rgba(0,0,0,.22);border-radius:22px;padding:13px 15px 12px;margin-top:12px}\n.comparison-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}\n.comparison-head>div{display:grid;gap:2px}.comparison-head strong{font-size:15px}.comparison-head small{font-size:10px;white-space:nowrap}\n.comparison-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:10px}\n.comparison-item{min-width:0;border:1px solid rgba(255,255,255,.055);background:rgba(255,255,255,.035);border-radius:12px;padding:8px 7px;display:grid;gap:3px;text-align:center}\n.comparison-item.portfolio{background:rgba(109,141,255,.09);border-color:rgba(109,141,255,.16)}\n.comparison-item span{font-size:10px;color:#7f8ca1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.comparison-item strong{font-size:13px;font-variant-numeric:tabular-nums}\n.comparison-summary{margin-top:8px;font-size:10.5px;color:#8290a5;text-align:center;min-height:13px}\n@media(max-width:720px){\n  .wallet-home-card{min-height:0;padding:15px 16px 13px}\n  .wallet-home-card .hero-value{font-size:34px;margin:4px 0 7px}\n  .wallet-home-card .hero-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:12px;padding-top:11px}\n  .wallet-home-card .hero-grid>div{padding:4px 0}\n  .wallet-home-card .hero-grid strong{font-size:12px}\n  .wallet-home-card .metric-label{font-size:9.5px}\n  .comparison-card{padding:11px 12px 10px;margin-top:9px}\n  .comparison-head strong{font-size:14px}.comparison-head .eyebrow{font-size:9px}.comparison-head small{display:none}\n  .comparison-grid{gap:5px;margin-top:8px}\n  .comparison-item{padding:7px 4px;border-radius:10px}.comparison-item span{font-size:9px}.comparison-item strong{font-size:12px}\n  .comparison-summary{margin-top:6px;font-size:9.5px}\n}\n@media(max-width:365px){\n  .wallet-home-card .hero-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}\n  .comparison-grid{grid-template-columns:repeat(2,minmax(0,1fr))}\n}\n`;
writeFileSync(stylesPath, styles);

let app = readFileSync(appPath, 'utf8');
app = replaceOnce(
  app,
  'function toast(message) {',
  `let homeComparisonData = null;\nlet homeComparisonPromise = null;\nlet homeComparisonFetchedAt = 0;\nconst HOME_COMPARISON_TTL_MS = 5 * 60 * 1000;\n\nfunction comparisonMoveFromYahoo(json) {\n  const result = json?.chart?.result?.[0];\n  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close) ? result.indicators.quote[0].close : [];\n  const points = closes.map(Number).filter(Number.isFinite);\n  if (points.length < 2) return null;\n  const previous = points[points.length - 2];\n  const current = points[points.length - 1];\n  if (!(previous > 0) || !(current > 0)) return null;\n  return ((current / previous) - 1) * 100;\n}\n\nasync function fetchComparisonMove(symbol) {\n  const url = \`https://query1.finance.yahoo.com/v8/finance/chart/\${encodeURIComponent(symbol)}?range=5d&interval=1d&includePrePost=false&events=div%2Csplits\`;\n  return comparisonMoveFromYahoo(await httpGetJson(url));\n}\n\nfunction setComparisonMetric(id, value) {\n  const el = $(id);\n  if (!el) return;\n  el.textContent = pct(value);\n  el.classList.remove('positive','negative','neutral');\n  el.classList.add(signClass(value));\n}\n\nfunction renderHomeComparison() {\n  const portfolioPct = Number(state.portfolio?.totals?.dailyPct);\n  const safePortfolioPct = Number.isFinite(portfolioPct) ? portfolioPct : null;\n  setComparisonMetric('#comparisonPortfolio', safePortfolioPct);\n  setComparisonMetric('#comparisonGold', homeComparisonData?.goldTlPct ?? null);\n  setComparisonMetric('#comparisonBist', homeComparisonData?.bistPct ?? null);\n  setComparisonMetric('#comparisonUsd', homeComparisonData?.usdPct ?? null);\n\n  const status = $('#comparisonStatus');\n  if (status) status.textContent = homeComparisonData ? 'Günlük değişim' : 'Referanslar yükleniyor…';\n  const summary = $('#comparisonSummary');\n  if (!summary) return;\n  const goldPct = Number(homeComparisonData?.goldTlPct);\n  if (safePortfolioPct == null || !Number.isFinite(goldPct)) {\n    summary.textContent = homeComparisonData ? 'Karşılaştırılabilir verilerden bazıları henüz alınamadı.' : 'Günlük referanslar hazırlanıyor.';\n    return;\n  }\n  const diff = safePortfolioPct - goldPct;\n  const magnitude = Math.abs(diff);\n  summary.textContent = magnitude < 0.005\n    ? 'Portföy bugün altınla hemen hemen aynı seviyede.'\n    : \`Portföy bugün altından \${fmtNum.format(magnitude)} puan \${diff > 0 ? 'önde' : 'geride'}.\`;\n}\n\nasync function loadHomeComparison({ force = false } = {}) {\n  if (!force && homeComparisonData && Date.now() - homeComparisonFetchedAt < HOME_COMPARISON_TTL_MS) {\n    renderHomeComparison();\n    return homeComparisonData;\n  }\n  if (!force && homeComparisonPromise) return homeComparisonPromise;\n\n  const task = Promise.allSettled([\n    fetchComparisonMove('GC=F'),\n    fetchComparisonMove('XU100.IS'),\n    fetchComparisonMove('TRY=X'),\n  ]).then(([goldResult, bistResult, usdResult]) => {\n    const goldUsdPct = goldResult.status === 'fulfilled' ? goldResult.value : null;\n    const bistPct = bistResult.status === 'fulfilled' ? bistResult.value : null;\n    const usdPct = usdResult.status === 'fulfilled' ? usdResult.value : null;\n    const goldTlPct = Number.isFinite(Number(goldUsdPct)) && Number.isFinite(Number(usdPct))\n      ? (((1 + Number(goldUsdPct) / 100) * (1 + Number(usdPct) / 100)) - 1) * 100\n      : null;\n    homeComparisonData = { goldTlPct, bistPct, usdPct };\n    homeComparisonFetchedAt = Date.now();\n    renderHomeComparison();\n    return homeComparisonData;\n  }).catch(() => {\n    renderHomeComparison();\n    return homeComparisonData;\n  }).finally(() => {\n    if (homeComparisonPromise === task) homeComparisonPromise = null;\n  });\n  homeComparisonPromise = task;\n  return task;\n}\n\nlet portfolioShareResetTimer = null;\n\nfunction finishPortfolioShareCapture() {\n  const card = $('#portfolioHeroCard');\n  const btn = $('#sharePortfolioBtn');\n  if (card) card.classList.remove('share-capture');\n  document.body.classList.remove('share-capture-active');\n  if (btn) btn.disabled = false;\n  if (portfolioShareResetTimer) {\n    clearTimeout(portfolioShareResetTimer);\n    portfolioShareResetTimer = null;\n  }\n}\n\nwindow.__portfolioShareCaptureComplete = finishPortfolioShareCapture;\n\nfunction sharePortfolioCardImage() {\n  const card = $('#portfolioHeroCard');\n  const btn = $('#sharePortfolioBtn');\n  if (!card) {\n    if (btn) btn.disabled = false;\n    toast('Portföy kartı bulunamadı.');\n    return;\n  }\n  if (typeof window.AndroidBridge?.shareCardImage !== 'function') {\n    if (btn) btn.disabled = false;\n    toast('Görsel paylaşımı yalnız Android uygulamasında kullanılabilir.');\n    return;\n  }\n\n  card.classList.add('share-capture');\n  document.body.classList.add('share-capture-active');\n  if (portfolioShareResetTimer) clearTimeout(portfolioShareResetTimer);\n  portfolioShareResetTimer = setTimeout(finishPortfolioShareCapture, 1800);\n\n  requestAnimationFrame(() => {\n    requestAnimationFrame(() => {\n      try {\n        const rect = card.getBoundingClientRect();\n        const scale = Math.max(1, Number(window.devicePixelRatio) || 1);\n        window.AndroidBridge.shareCardImage(\n          rect.left * scale,\n          rect.top * scale,\n          rect.width * scale,\n          rect.height * scale\n        );\n      } catch {\n        finishPortfolioShareCapture();\n        toast('Portföy kartı paylaşımı açılamadı.');\n      }\n    });\n  });\n}\n\nfunction toast(message) {`,
  'comparison and image share functions'
);
app = replaceOnce(
  app,
  `  $('#lastUpdated').textContent = marketDataText(data);\n  $('#lastUpdated').title = 'Fiyat kaynağı gecikmeli olabilir; bu saat gerçek piyasa verisinin zaman damgasıdır.';\n`,
  '',
  'market timestamp removal'
);
app = replaceOnce(
  app,
  `  $('#holdingCount').textContent = \`\${data.holdings.length} hisse\`;`,
  `  $('#holdingCount').textContent = \`\${data.holdings.length} hisse\`;\n  renderHomeComparison();`,
  'comparison render hook'
);
app = replaceOnce(
  app,
  `    await loadPortfolio({ quiet:true, force:true });\n    await refreshBackgroundHistory({ force:true, announce:true });`,
  `    await loadPortfolio({ quiet:true, force:true });\n    await loadHomeComparison({ force:true });\n    await refreshBackgroundHistory({ force:true, announce:true });`,
  'manual comparison refresh hook'
);
app = replaceOnce(
  app,
  `    if (state.view === 'portfolio') loadPortfolio({ quiet:true });`,
  `    if (state.view === 'portfolio') { loadPortfolio({ quiet:true }); loadHomeComparison(); }`,
  'resume comparison refresh hook'
);
app = replaceOnce(
  app,
  `$('#chartRange').addEventListener('change', () => { state.chartSelectedIndex = null; renderDailyHistory(); drawChart(); });`,
  `$('#sharePortfolioBtn')?.addEventListener('click', () => {\n  const btn = $('#sharePortfolioBtn');\n  if (btn?.disabled) return;\n  if (btn) btn.disabled = true;\n  sharePortfolioCardImage();\n});\n$('#chartRange').addEventListener('change', () => { state.chartSelectedIndex = null; renderDailyHistory(); drawChart(); });`,
  'portfolio image share listener'
);
app = replaceOnce(
  app,
  `loadPortfolio();\nsetTimeout(() => refreshBackgroundHistory(), 900);`,
  `loadPortfolio();\nloadHomeComparison();\nsetTimeout(() => refreshBackgroundHistory(), 900);`,
  'initial comparison load'
);
writeFileSync(appPath, app);

let activity = readFileSync(activityPath, 'utf8');
activity = replaceOnce(activity, 'import android.content.Context;\n', 'import android.content.ClipData;\nimport android.content.Context;\n', 'clip data import');
activity = replaceOnce(activity, 'import android.graphics.Color;\n', 'import android.graphics.Bitmap;\nimport android.graphics.Canvas;\nimport android.graphics.Color;\n', 'bitmap imports');
activity = replaceOnce(activity, 'import androidx.core.content.ContextCompat;\n', 'import androidx.core.content.ContextCompat;\nimport androidx.core.content.FileProvider;\n', 'file provider import');
activity = replaceOnce(activity, 'import java.io.ByteArrayOutputStream;\n', 'import java.io.ByteArrayOutputStream;\nimport java.io.File;\nimport java.io.FileOutputStream;\n', 'share file imports');
activity = replaceOnce(
  activity,
  '    private void openAppNotificationSettings() {',
  `    private void sharePortfolioCardImage(double leftPx, double topPx, double widthPx, double heightPx) {\n        WebView currentWebView = webView;\n        if (currentWebView == null) return;\n        try {\n            int viewWidth = currentWebView.getWidth();\n            int viewHeight = currentWebView.getHeight();\n            int left = Math.max(0, (int) Math.round(leftPx));\n            int top = Math.max(0, (int) Math.round(topPx));\n            int right = Math.min(viewWidth, left + Math.max(1, (int) Math.round(widthPx)));\n            int bottom = Math.min(viewHeight, top + Math.max(1, (int) Math.round(heightPx)));\n            if (viewWidth <= 0 || viewHeight <= 0 || right <= left || bottom <= top) {\n                throw new IllegalStateException("Portföy kartı görünür değil.");\n            }\n\n            Bitmap fullBitmap = Bitmap.createBitmap(viewWidth, viewHeight, Bitmap.Config.ARGB_8888);\n            Canvas canvas = new Canvas(fullBitmap);\n            currentWebView.draw(canvas);\n            Bitmap cardBitmap = Bitmap.createBitmap(fullBitmap, left, top, right - left, bottom - top);\n            fullBitmap.recycle();\n\n            File shareDir = new File(getCacheDir(), "shared");\n            if (!shareDir.exists() && !shareDir.mkdirs()) {\n                cardBitmap.recycle();\n                throw new IllegalStateException("Paylaşım klasörü oluşturulamadı.");\n            }\n            File imageFile = new File(shareDir, "portfolio-card.png");\n            try (FileOutputStream output = new FileOutputStream(imageFile)) {\n                if (!cardBitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {\n                    throw new IllegalStateException("Portföy kartı görseli oluşturulamadı.");\n                }\n            } finally {\n                cardBitmap.recycle();\n            }\n\n            Uri imageUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", imageFile);\n            Intent shareIntent = new Intent(Intent.ACTION_SEND);\n            shareIntent.setType("image/png");\n            shareIntent.putExtra(Intent.EXTRA_STREAM, imageUri);\n            shareIntent.setClipData(ClipData.newRawUri("Portföy kartı", imageUri));\n            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);\n            startActivity(Intent.createChooser(shareIntent, "Portföy kartını paylaş"));\n        } catch (Exception error) {\n            Toast.makeText(this, "Portföy kartı paylaşımı açılamadı", Toast.LENGTH_SHORT).show();\n        } finally {\n            WebView latestWebView = webView;\n            if (latestWebView != null) {\n                latestWebView.post(() -> latestWebView.evaluateJavascript(\n                        "window.__portfolioShareCaptureComplete && window.__portfolioShareCaptureComplete();", null));\n            }\n        }\n    }\n\n    private void openAppNotificationSettings() {`,
  'native card image share helper'
);
activity = replaceOnce(
  activity,
  `        @JavascriptInterface\n        public void setSystemTheme(String theme) {`,
  `        @JavascriptInterface\n        public void shareCardImage(double leftPx, double topPx, double widthPx, double heightPx) {\n            activity.runOnUiThread(() -> activity.sharePortfolioCardImage(leftPx, topPx, widthPx, heightPx));\n        }\n\n        @JavascriptInterface\n        public void setSystemTheme(String theme) {`,
  'native image share bridge'
);
writeFileSync(activityPath, activity);

let manifest = readFileSync(manifestPath, 'utf8');
manifest = replaceOnce(
  manifest,
  `        <activity\n            android:name="com.innative.halkaarz.MainActivity"\n            android:exported="true"\n            android:windowSoftInputMode="adjustResize">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n        </activity>`,
  `        <activity\n            android:name="com.innative.halkaarz.MainActivity"\n            android:exported="true"\n            android:windowSoftInputMode="adjustResize">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n        </activity>\n        <provider\n            android:name="androidx.core.content.FileProvider"\n            android:authorities="${providerAuthority}"\n            android:exported="false"\n            android:grantUriPermissions="true">\n            <meta-data\n                android:name="android.support.FILE_PROVIDER_PATHS"\n                android:resource="@xml/share_file_paths" />\n        </provider>`,
  'share file provider manifest entry'
);
writeFileSync(manifestPath, manifest);

writeFileSync(
  sharePathsPath,
  `<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android">\n    <cache-path name="shared_images" path="shared/" />\n</paths>\n`
);

copyFileSync(launcherSource, launcherTarget);
console.log('Applied isolated test wallet/comparison/image-share overlay.');