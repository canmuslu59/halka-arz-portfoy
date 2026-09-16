import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const indexPath = 'android/app/src/main/assets/www/index.html';
const appPath = 'android/app/src/main/assets/www/app.js';
const stylesPath = 'android/app/src/main/assets/www/styles.css';
const activityPath = 'android/app/src/main/java/com/innative/halkaarz/MainActivity.java';
const launcherSource = 'android/app/src/main/res/drawable-nodpi/ic_launcher.webp';
const launcherTarget = 'android/app/src/main/assets/www/launcher-icon.webp';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, replacement);
}

let index = readFileSync(indexPath, 'utf8');
index = replaceOnce(
  index,
  'src="./icon.svg"',
  'src="./launcher-icon.webp"',
  'launcher artwork'
);
index = replaceOnce(
  index,
  '<section class="hero-card" aria-labelledby="portfolioValueLabel">',
  '<section class="hero-card" aria-label="Portföy özeti">',
  'hero accessibility label'
);
index = replaceOnce(
  index,
  `      <div class="hero-topline">\n        <span id="portfolioValueLabel" class="muted">Toplam portföy büyüklüğü</span>\n        <span id="lastUpdated" class="status-dot">—</span>\n      </div>`,
  `      <div class="hero-topline hero-topline-actions">\n        <button id="sharePortfolioBtn" class="icon-btn share-btn" type="button" aria-label="Portföy özetini paylaş" title="Paylaş">\n          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5"/><path d="M8 9l4-4 4 4"/><path d="M5 13v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>\n        </button>\n      </div>`,
  'hero share action'
);
writeFileSync(indexPath, index);

let styles = readFileSync(stylesPath, 'utf8');
styles = replaceOnce(
  styles,
  '.hero-topline{justify-content:space-between;gap:16px}',
  `.hero-topline{justify-content:space-between;gap:16px}\n.hero-topline-actions{justify-content:flex-end;margin-bottom:6px}\n.share-btn{position:relative;z-index:1;flex:0 0 auto}\n.topbar-logo{display:block;width:44px;height:44px;border-radius:12px;object-fit:cover}`,
  'hero share styles'
);
writeFileSync(stylesPath, styles);

let app = readFileSync(appPath, 'utf8');
app = replaceOnce(
  app,
  'function toast(message) {',
  `async function sharePortfolioSummary() {\n  const data = state.portfolio;\n  if (!data?.totals) {\n    toast('Paylaşmak için önce portföy verisi yüklenmeli.');\n    return;\n  }\n  const t = data.totals;\n  const text = [\n    'Portföy Özeti',\n    \`Toplam değer: \${money(t.totalWealth)}\`,\n    \`Toplam kâr / zarar: \${money(t.totalProfit)} (\${pct(t.totalProfitPct)})\`,\n    \`Bugün: \${money(t.dailyProfit)} (\${pct(t.dailyPct)})\`,\n    \`Yatırılan: \${money(t.invested)}\`,\n    \`Aktif değer: \${money(t.activeValue)}\`,\n    \`Satış nakdi: \${money(t.salesProceeds)}\`,\n    \`Hisse sayısı: \${data.holdings.length}\`\n  ].join('\\n');\n\n  try {\n    if (typeof window.AndroidBridge?.shareText === 'function') {\n      window.AndroidBridge.shareText('Portföy Özeti', text);\n      return;\n    }\n  } catch {}\n\n  try {\n    if (navigator.share) {\n      await navigator.share({ title:'Portföy Özeti', text });\n      return;\n    }\n  } catch (error) {\n    if (error?.name === 'AbortError') return;\n  }\n\n  try {\n    if (navigator.clipboard?.writeText) {\n      await navigator.clipboard.writeText(text);\n      toast('Paylaşım desteklenmiyor; özet panoya kopyalandı.');\n      return;\n    }\n  } catch {}\n  toast('Paylaşım bu cihazda açılamadı.');\n}\n\nfunction toast(message) {`,
  'portfolio share function'
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
  `$('#sharePortfolioBtn')?.addEventListener('click', async () => {\n  const btn = $('#sharePortfolioBtn');\n  if (btn?.disabled) return;\n  if (btn) btn.disabled = true;\n  try { await sharePortfolioSummary(); }\n  finally { if (btn) btn.disabled = false; }\n});\n$('#chartRange').addEventListener('change', () => { state.chartSelectedIndex = null; renderDailyHistory(); drawChart(); });`,
  'portfolio share listener'
);
writeFileSync(appPath, app);

let activity = readFileSync(activityPath, 'utf8');
activity = replaceOnce(
  activity,
  `        @JavascriptInterface\n        public void setSystemTheme(String theme) {`,
  `        @JavascriptInterface\n        public void shareText(String title, String text) {\n            activity.runOnUiThread(() -> {\n                Intent shareIntent = new Intent(Intent.ACTION_SEND);\n                shareIntent.setType("text/plain");\n                shareIntent.putExtra(Intent.EXTRA_SUBJECT, title == null ? "" : title);\n                shareIntent.putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);\n                activity.startActivity(Intent.createChooser(shareIntent, "Portföy özetini paylaş"));\n            });\n        }\n\n        @JavascriptInterface\n        public void setSystemTheme(String theme) {`,
  'native share bridge'
);
writeFileSync(activityPath, activity);

copyFileSync(launcherSource, launcherTarget);
console.log('Applied isolated test UI/share overlay.');
