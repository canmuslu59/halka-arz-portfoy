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
  '<section id="portfolioHeroCard" class="hero-card hero-home-card" aria-label="Portföy özeti">',
  'hero card identity'
);
index = replaceOnce(
  index,
  `      <div class="hero-topline">\n        <span id="portfolioValueLabel" class="muted">Toplam portföy büyüklüğü</span>\n        <span id="lastUpdated" class="status-dot">—</span>\n      </div>`,
  `      <div class="hero-topline hero-topline-actions">\n        <button id="sharePortfolioBtn" class="icon-btn share-btn" type="button" aria-label="Portföy kartını görsel olarak paylaş" title="Paylaş">\n          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5"/><path d="M8 9l4-4 4 4"/><path d="M5 13v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>\n        </button>\n      </div>`,
  'hero share action'
);
writeFileSync(indexPath, index);

let styles = readFileSync(stylesPath, 'utf8');
styles += `\n\n/* Isolated test-only hero home card + image share UI. */\n.topbar-logo{display:block;width:44px;height:44px;border-radius:12px;object-fit:cover}\n.hero-topline-actions{justify-content:flex-end;margin-bottom:6px}\n.share-btn{position:relative;z-index:3;flex:0 0 auto}\n.hero-card.share-capture .share-btn{visibility:hidden!important}\n@media(max-width:720px){\n  .hero-card.hero-home-card{\n    min-height:calc(100dvh - var(--android-safe-top,0px) - 78px);\n    display:flex;\n    flex-direction:column;\n    box-sizing:border-box;\n    padding-bottom:max(112px,calc(var(--android-safe-bottom,0px) + 100px));\n  }\n  .hero-home-card .hero-topline-actions{position:absolute;top:18px;right:18px;margin:0}\n  .hero-home-card .hero-value{margin-top:auto}\n  .hero-home-card .hero-grid{margin-bottom:auto}\n}\n`;
writeFileSync(stylesPath, styles);

let app = readFileSync(appPath, 'utf8');
app = replaceOnce(
  app,
  'function toast(message) {',
  `let portfolioShareResetTimer = null;\n\nfunction finishPortfolioShareCapture() {\n  const card = $('#portfolioHeroCard');\n  const btn = $('#sharePortfolioBtn');\n  if (card) card.classList.remove('share-capture');\n  if (btn) btn.disabled = false;\n  if (portfolioShareResetTimer) {\n    clearTimeout(portfolioShareResetTimer);\n    portfolioShareResetTimer = null;\n  }\n}\n\nwindow.__portfolioShareCaptureComplete = finishPortfolioShareCapture;\n\nfunction sharePortfolioCardImage() {\n  const card = $('#portfolioHeroCard');\n  const btn = $('#sharePortfolioBtn');\n  if (!card) {\n    if (btn) btn.disabled = false;\n    toast('Portföy kartı bulunamadı.');\n    return;\n  }\n  if (typeof window.AndroidBridge?.shareCardImage !== 'function') {\n    if (btn) btn.disabled = false;\n    toast('Görsel paylaşımı yalnız Android uygulamasında kullanılabilir.');\n    return;\n  }\n\n  card.classList.add('share-capture');\n  if (portfolioShareResetTimer) clearTimeout(portfolioShareResetTimer);\n  portfolioShareResetTimer = setTimeout(finishPortfolioShareCapture, 1800);\n\n  requestAnimationFrame(() => {\n    requestAnimationFrame(() => {\n      try {\n        const rect = card.getBoundingClientRect();\n        const scale = Math.max(1, Number(window.devicePixelRatio) || 1);\n        window.AndroidBridge.shareCardImage(\n          rect.left * scale,\n          rect.top * scale,\n          rect.width * scale,\n          rect.height * scale\n        );\n      } catch {\n        finishPortfolioShareCapture();\n        toast('Portföy kartı paylaşımı açılamadı.');\n      }\n    });\n  });\n}\n\nfunction toast(message) {`,
  'portfolio image share function'
);
app = replaceOnce(
  app,
  `  $('#lastUpdated').textContent = marketDataText(data);\n  $('#lastUpdated').title = 'Fiyat kaynağı gecikmeli olabilir; bu saat gerçek piyasa verisinin zaman damgasıdır.';\n`,
  '',
  'market timestamp removal'
);
app = replaceOnce(
  app,
  `$('#chartRange').addEventListener('change', () => { state.chartSelectedIndex = null; renderDailyHistory(); drawChart(); });`,
  `$('#sharePortfolioBtn')?.addEventListener('click', () => {\n  const btn = $('#sharePortfolioBtn');\n  if (btn?.disabled) return;\n  if (btn) btn.disabled = true;\n  sharePortfolioCardImage();\n});\n$('#chartRange').addEventListener('change', () => { state.chartSelectedIndex = null; renderDailyHistory(); drawChart(); });`,
  'portfolio image share listener'
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
console.log('Applied isolated test hero/image-share overlay.');
