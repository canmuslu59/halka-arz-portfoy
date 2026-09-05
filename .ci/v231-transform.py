from pathlib import Path
import sys

root = Path(sys.argv[1])

def req_replace(path, old, new, count=1):
    p = root / path
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'missing pattern in {path}: {old[:120]!r}')
    s2 = s.replace(old, new, count)
    p.write_text(s2)

req_replace('android/app/build.gradle', "        versionCode 12\n        versionName '2.3.0'", "        versionCode 13\n        versionName '2.3.1'")

p = root/'android/app/src/main/java/com/innative/halkaarz/MainActivity.java'
s = p.read_text()
for old,new in [
("import java.net.URL;\n", "import java.net.URL;\nimport java.util.concurrent.ExecutorService;\nimport java.util.concurrent.Executors;\n"),
("    private static final int NOTIFICATION_PERMISSION_REQUEST = 2301;\n", "    private static final int NOTIFICATION_PERMISSION_REQUEST = 2301;\n    private static final ExecutorService NETWORK_EXECUTOR = Executors.newCachedThreadPool();\n"),
("    private JSONObject pendingPushRoute;\n", "    private JSONObject pendingPushRoute;\n    private int safeTopCssPx;\n    private int safeBottomCssPx;\n    private int safeLeftCssPx;\n    private int safeRightCssPx;\n"),
]:
    if old not in s: raise SystemExit(f'MainActivity missing {old!r}')
    s=s.replace(old,new,1)
start=s.index('    private void applyInsets(WebView view) {')
end=s.index('    private void setSystemBarIcons(boolean lightTheme) {', start)
new_apply='''    private void applyInsets(WebView view) {
        ViewCompat.setOnApplyWindowInsetsListener(view, (target, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            float density = Math.max(1f, getResources().getDisplayMetrics().density);
            safeTopCssPx = Math.round(bars.top / density);
            safeBottomCssPx = Math.round(bars.bottom / density);
            safeLeftCssPx = Math.round(bars.left / density);
            safeRightCssPx = Math.round(bars.right / density);
            deliverSafeInsets();
            return insets;
        });
        ViewCompat.requestApplyInsets(view);
    }

    private void deliverSafeInsets() {
        if (webView == null) return;
        String script = "document.documentElement.style.setProperty('--android-safe-top','" + safeTopCssPx + "px');"
                + "document.documentElement.style.setProperty('--android-safe-bottom','" + safeBottomCssPx + "px');"
                + "document.documentElement.style.setProperty('--android-safe-left','" + safeLeftCssPx + "px');"
                + "document.documentElement.style.setProperty('--android-safe-right','" + safeRightCssPx + "px');";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

'''
s=s[:start]+new_apply+s[end:]
old='''                super.onPageFinished(webView, url);
                deliverPendingPushRoute();'''
new='''                super.onPageFinished(webView, url);
                deliverSafeInsets();
                deliverPendingPushRoute();'''
if old not in s: raise SystemExit('onPageFinished anchor missing')
s=s.replace(old,new,1)
start=s.index('        @JavascriptInterface\n        public String httpGet(String urlText) {')
local_marker='    private static class LocalAssetClient extends WebViewClient {'
marker_idx=s.index(local_marker,start)
bridge_close=s.rfind('    }\n\n', start, marker_idx)
if bridge_close < start: raise SystemExit('bridge close not found')
new_async='''        @JavascriptInterface
        public void httpGetAsync(String urlText, String requestId) {
            final String safeRequestId = requestId == null ? "" : requestId;
            try {
                NETWORK_EXECUTOR.execute(() -> {
                    String envelope = performHttpGet(urlText);
                    if (webView == null) return;
                    String callback = "window.__nativeHttpResolve && window.__nativeHttpResolve("
                            + JSONObject.quote(safeRequestId) + "," + JSONObject.quote(envelope) + ");";
                    webView.post(() -> webView.evaluateJavascript(callback, null));
                });
            } catch (Exception error) {
                if (webView == null) return;
                String message = error.getMessage() == null ? "Ağ isteği başlatılamadı." : error.getMessage();
                String callback = "window.__nativeHttpReject && window.__nativeHttpReject("
                        + JSONObject.quote(safeRequestId) + "," + JSONObject.quote(message) + ");";
                webView.post(() -> webView.evaluateJavascript(callback, null));
            }
        }

'''
s=s[:start]+new_async+s[bridge_close:]
marker_idx=s.index(local_marker)
helper='''    private static String performHttpGet(String urlText) {
        JSONObject envelope = new JSONObject();
        HttpURLConnection connection = null;
        try {
            URL url = new URL(urlText);
            if (!"https".equalsIgnoreCase(url.getProtocol())) throw new IllegalArgumentException("Yalnız HTTPS bağlantısına izin verilir.");
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setRequestMethod("GET");
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36");
            connection.setRequestProperty("Accept", "application/json,text/plain,text/html,*/*");
            connection.setRequestProperty("Accept-Language", "tr-TR,tr;q=0.9,en;q=0.8");
            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
            String body = stream == null ? "" : readUtf8(stream, MAX_RESPONSE_BYTES);
            if (status < 200 || status >= 300) {
                envelope.put("ok", false); envelope.put("status", status); envelope.put("error", "HTTP " + status);
            } else {
                envelope.put("ok", true); envelope.put("status", status); envelope.put("body", body);
            }
        } catch (Exception error) {
            try {
                envelope.put("ok", false); envelope.put("status", 0);
                envelope.put("error", error.getMessage() == null ? "Ağ isteği başarısız." : error.getMessage());
            } catch (Exception ignored) { return "{\\\"ok\\\":false,\\\"status\\\":0,\\\"error\\\":\\\"Ağ isteği başarısız.\\\"}"; }
        } finally {
            if (connection != null) connection.disconnect();
        }
        return envelope.toString();
    }

'''
s=s[:marker_idx]+helper+s[marker_idx:]
p.write_text(s)

p=root/'android/app/src/main/assets/www/index.html'; s=p.read_text()
anchor='''        <button id="refreshBtn" class="icon-btn" aria-label="Verileri güncelle" title="Güncelle">'''
theme='''        <button id="themeToggle" class="icon-btn theme-toggle" aria-label="Açık temaya geç" title="Tema">
          <svg class="theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8 8 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/></svg>
          <svg class="theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>
        </button>
'''
if anchor not in s: raise SystemExit('index refresh anchor missing')
s=s.replace(anchor, theme+anchor,1)
theme_card='''        <article class="settings-card">
          <div><span class="eyebrow">GÖRÜNÜM</span><h2>Tema</h2></div>
          <label class="setting-select-label" for="themeSetting">Uygulama görünümü</label>
          <select id="themeSetting" class="select settings-select">
            <option value="dark">Koyu</option>
            <option value="light">Açık</option>
          </select>
        </article>

'''
if theme_card not in s: raise SystemExit('theme card missing')
s=s.replace(theme_card,'',1)
s=s.replace('v2.3.0 • Build 12','v2.3.1 • Build 13',1)
p.write_text(s)

p=root/'android/app/src/main/assets/www/app.js'; s=p.read_text()
repls=[
("import { resolveTheme } from './core/theme.js';", "import { resolveTheme, nextTheme } from './core/theme.js';"),
("  const themeSetting = $('#themeSetting');\n  if (themeSetting) themeSetting.value = resolved;", "  const toggle = $('#themeToggle');\n  if (toggle) toggle.setAttribute('aria-label', resolved === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç');"),
("  if ($('#themeSetting')) $('#themeSetting').value = state.theme || 'dark';\n", ""),
("$('#themeSetting')?.addEventListener('change', event => applyTheme(event.target.value));", "$('#themeToggle')?.addEventListener('click', () => applyTheme(nextTheme(state.theme)));"),
]
for old,new in repls:
    if old not in s: raise SystemExit(f'app.js missing {old[:80]!r}')
    s=s.replace(old,new,1)
start=s.index('async function loadPortfolio({ quiet = false, force = false } = {}) {')
end=s.index('\nasync function refreshBackgroundHistory',start)
new_load='''let portfolioRefreshPromise = null;
async function loadPortfolio({ quiet = false, force = false } = {}) {
  if (portfolioRefreshPromise) return portfolioRefreshPromise;
  const btn = $('#refreshBtn');
  const run = (async () => {
    if (!quiet) btn?.classList.add('spinning');
    try {
      const cached = await service.getPortfolio({ refresh:false });
      state.portfolio = cached;
      renderPortfolio(cached);

      const fresh = await service.getPortfolio({ refresh:true, force });
      state.portfolio = fresh;
      renderPortfolio(fresh);
      syncPushConfiguration();
      return fresh;
    } catch (error) {
      toast(error.message);
      return state.portfolio;
    } finally {
      if (!quiet) btn?.classList.remove('spinning');
    }
  })();
  portfolioRefreshPromise = run;
  try {
    return await run;
  } finally {
    if (portfolioRefreshPromise === run) portfolioRefreshPromise = null;
  }
}
'''
s=s[:start]+new_load+s[end:]
old_click='''$('#refreshBtn').addEventListener('click', async () => {
  await loadPortfolio({ force:true });
  await refreshBackgroundHistory({ force:true, announce:true });
});'''
new_click='''$('#refreshBtn').addEventListener('click', async () => {
  const btn = $('#refreshBtn');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add('spinning');
  try {
    await loadPortfolio({ quiet:true, force:true });
    await refreshBackgroundHistory({ force:true, announce:true });
  } finally {
    btn.classList.remove('spinning');
    btn.disabled = false;
  }
});'''
if old_click not in s: raise SystemExit('refresh click block missing')
s=s.replace(old_click,new_click,1)
p.write_text(s)

p=root/'android/app/src/main/assets/www/styles.css'; s=p.read_text()
repls=[
("  --radius: 24px;\n", "  --radius: 24px;\n  --android-safe-top: 0px;\n  --android-safe-bottom: 0px;\n  --android-safe-left: 0px;\n  --android-safe-right: 0px;\n"),
(".shell{width:min(100% - 28px, 980px);margin-inline:auto}", ".shell{width:min(100% - 28px, 980px);margin-inline:auto;padding-left:var(--android-safe-left,0px);padding-right:var(--android-safe-right,0px)}"),
(".topbar{position:sticky;top:0;z-index:20;padding-top:max(14px,env(safe-area-inset-top));", ".topbar{position:sticky;top:0;z-index:20;padding-top:max(14px,env(safe-area-inset-top),var(--android-safe-top,0px));"),
(".bottom-nav{position:fixed;z-index:42;left:50%;bottom:max(10px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(calc(100% - 22px),560px);", ".bottom-nav{position:fixed;z-index:42;left:50%;bottom:max(10px,env(safe-area-inset-bottom),calc(var(--android-safe-bottom,0px) + 10px));transform:translateX(-50%);width:min(calc(100% - 22px - var(--android-safe-left,0px) - var(--android-safe-right,0px)),560px);"),
(".nav-tab{border:0;border-radius:16px;", ".nav-tab{min-width:0;border:0;border-radius:16px;"),
(".main{padding-bottom:154px}.fab{bottom:max(88px,calc(env(safe-area-inset-bottom) + 82px))}.toast{bottom:96px}", ".main{padding-bottom:calc(154px + var(--android-safe-bottom,0px))}.fab{bottom:max(88px,calc(env(safe-area-inset-bottom) + 82px),calc(var(--android-safe-bottom,0px) + 82px))}.toast{bottom:calc(96px + var(--android-safe-bottom,0px))}"),
("@media(max-width:365px){.market-status", "@media(max-width:365px){.nav-tab{padding-inline:2px}.nav-tab b{font-size:9px}.nav-tab span{font-size:16px}.market-status"),
]
for old,new in repls:
    if old not in s: raise SystemExit(f'styles missing {old[:80]!r}')
    s=s.replace(old,new,1)
p.write_text(s)
