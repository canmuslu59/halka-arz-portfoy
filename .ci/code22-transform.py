from pathlib import Path

root = Path('.')

def replace_once(path, old, new):
    p = root / path
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# 1) Isolate each active/upcoming IPO card so page intro/adjacent cards cannot contaminate fields.
replace_once(
    'public/core/parsers.js',
    """  for (const link of detailLinks) {\n    const index = link.index || 0;\n    const windowStart = Math.max(0, index - 1800);\n    const windowEnd = Math.min(activeScope.length, index + link[0].length + 2600);\n    const cardHtml = activeScope.slice(windowStart, windowEnd);\n""",
    """  const cardLinks = [];\n  for (const link of detailLinks) {\n    const href = String(link[1] || '');\n    const previous = cardLinks.at(-1);\n    if (previous && previous.href === href) {\n      previous.lastEnd = (link.index || 0) + link[0].length;\n      continue;\n    }\n    cardLinks.push({ href, link, start:link.index || 0, lastEnd:(link.index || 0) + link[0].length });\n  }\n\n  for (let cardIndex = 0; cardIndex < cardLinks.length; cardIndex++) {\n    const { link, start } = cardLinks[cardIndex];\n    const windowEnd = cardLinks[cardIndex + 1]?.start ?? activeScope.length;\n    const cardHtml = activeScope.slice(start, windowEnd);\n""",
)
replace_once(
    'public/core/parsers.js',
    """  const consortiumText = textFromHtml(sectionHtml(raw, 'Konsorsiyum Liderleri'));\n  const consortiumLeaders = consortiumText ? splitConsortium(consortiumText) : (base.consortiumLeaders || []);\n""",
    """  const consortiumText = textFromHtml(sectionHtml(raw, 'Konsorsiyum Liderleri'));\n  const consortiumLooksValid = consortiumText\n    && consortiumText.length <= 180\n    && !/(?:şirket detayları|Kamuyu Aydınlatma|ŞU AN AKTİF|Talep Toplayan Halka Arzlar)/i.test(consortiumText);\n  const consortiumLeaders = consortiumLooksValid ? splitConsortium(consortiumText) : (base.consortiumLeaders || []);\n""",
)

# 2) Make Android back delegate to the SPA navigation history first.
replace_once('public/app.js', "    threshold: state.alertSettings.threshold,\n    holdings:", "    threshold: state.alertSettings.threshold,\n    ipoEnabled: true,\n    holdings:")
replace_once(
    'public/app.js',
    "window.__pushTokenChanged = () => syncPushConfiguration();\nwindow.__handlePushRoute = route => {",
    """window.__pushTokenChanged = () => syncPushConfiguration();\nwindow.__handleAndroidBack = () => {\n  const depth = Number(window.history.state?.navDepth || 0);\n  if (depth > 0) {\n    window.history.back();\n    return true;\n  }\n  return false;\n};\nwindow.__handlePushRoute = route => {""",
)
replace_once(
    'public/app.js',
    "window.history.pushState({ appRoot:true, view:next, ...(selectedTicker ? { selectedTicker } : {}) }, '', `${location.pathname}${location.search}${hash}`);",
    "window.history.pushState({ appRoot:true, view:next, navDepth:Number(window.history.state?.navDepth || 0) + 1, ...(selectedTicker ? { selectedTicker } : {}) }, '', `${location.pathname}${location.search}${hash}`);",
)
replace_once(
    'public/app.js',
    "window.history.pushState({ appRoot:true, view:state.view, sheet:id, ...navigation }, '', hash);",
    "window.history.pushState({ appRoot:true, view:state.view, sheet:id, navDepth:Number(window.history.state?.navDepth || 0) + 1, ...navigation }, '', hash);",
)
replace_once(
    'public/app.js',
    "if (!window.history.state?.appRoot) window.history.replaceState({ appRoot:true, view:'portfolio' }, '', `${location.pathname}${location.search}`);",
    "if (!window.history.state?.appRoot) window.history.replaceState({ appRoot:true, view:'portfolio', navDepth:0 }, '', `${location.pathname}${location.search}`);\nelse if (!Number.isFinite(Number(window.history.state?.navDepth))) window.history.replaceState({ ...window.history.state, navDepth:0 }, '', location.href);",
)
replace_once('public/app.js', "initTheme();\napplyNavigationState(window.history.state);", "initTheme();\nsyncPushConfiguration();\napplyNavigationState(window.history.state);")

replace_once(
    'android/app/src/main/java/com/innative/halkaarz/MainActivity.java',
    """    @Override\n    public void onBackPressed() {\n        if (webView != null && webView.canGoBack()) {\n            webView.goBack();\n            lastBackPressMs = 0L;\n            return;\n        }\n        long now = System.currentTimeMillis();\n        if (now - lastBackPressMs <= EXIT_BACK_WINDOW_MS) {\n            super.onBackPressed();\n            return;\n        }\n        lastBackPressMs = now;\n        Toast.makeText(this, \"Çıkmak için tekrar geri basın\", Toast.LENGTH_SHORT).show();\n    }\n""",
    """    @Override\n    public void onBackPressed() {\n        if (webView != null) {\n            webView.evaluateJavascript(\"Boolean(window.__handleAndroidBack && window.__handleAndroidBack())\", value -> {\n                if (\"true\".equalsIgnoreCase(String.valueOf(value))) {\n                    lastBackPressMs = 0L;\n                    return;\n                }\n                handleExitBackPress();\n            });\n            return;\n        }\n        handleExitBackPress();\n    }\n\n    private void handleExitBackPress() {\n        long now = System.currentTimeMillis();\n        if (now - lastBackPressMs <= EXIT_BACK_WINDOW_MS) {\n            super.onBackPressed();\n            return;\n        }\n        lastBackPressMs = now;\n        Toast.makeText(this, \"Çıkmak için tekrar geri basın\", Toast.LENGTH_SHORT).show();\n    }\n""",
)
replace_once(
    'android/app/src/main/java/com/innative/halkaarz/MainActivity.java',
    """            if (webView != null) {\n                webView.post(() -> webView.evaluateJavascript(\"window.__notificationPermissionChanged && window.__notificationPermissionChanged();\", null));\n            }\n""",
    """            if (webView != null) {\n                webView.post(() -> webView.evaluateJavascript(\"window.__notificationPermissionChanged && window.__notificationPermissionChanged();\", null));\n            }\n            BackgroundAlertScheduler.ensure(this);\n""",
)

# 3) Run alerts immediately after config sync and periodically even when portfolio is empty (IPO alerts are independent).
Path('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java').write_text('''package com.innative.halkaarz;\n\nimport android.content.Context;\nimport android.content.SharedPreferences;\n\nimport androidx.work.Constraints;\nimport androidx.work.ExistingPeriodicWorkPolicy;\nimport androidx.work.ExistingWorkPolicy;\nimport androidx.work.NetworkType;\nimport androidx.work.OneTimeWorkRequest;\nimport androidx.work.PeriodicWorkRequest;\nimport androidx.work.WorkManager;\n\nimport org.json.JSONObject;\n\nimport java.util.concurrent.TimeUnit;\n\nfinal class BackgroundAlertScheduler {\n    private static final String WORK_NAME = "background_market_alerts_v2";\n    private static final String IMMEDIATE_WORK_NAME = "background_alert_immediate_v2";\n\n    private BackgroundAlertScheduler() {}\n\n    static void ensure(Context context) {\n        Context app = context.getApplicationContext();\n        SharedPreferences prefs = app.getSharedPreferences(PushConfigSync.PREFS, Context.MODE_PRIVATE);\n        String raw = prefs.getString(PushConfigSync.CONFIG_KEY, "");\n        if (raw == null || raw.trim().isEmpty()) { sync(app, false); return; }\n        try {\n            JSONObject config = new JSONObject(raw);\n            sync(app, config.optBoolean("enabled", true));\n        } catch (Exception ignored) { sync(app, false); }\n    }\n\n    static void sync(Context context, boolean enabled) {\n        Context app = context.getApplicationContext();\n        WorkManager manager = WorkManager.getInstance(app);\n        if (!enabled) {\n            manager.cancelUniqueWork(WORK_NAME);\n            manager.cancelUniqueWork(IMMEDIATE_WORK_NAME);\n            return;\n        }\n        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();\n        OneTimeWorkRequest immediate = new OneTimeWorkRequest.Builder(BackgroundAlertWorker.class).setConstraints(constraints).build();\n        manager.enqueueUniqueWork(IMMEDIATE_WORK_NAME, ExistingWorkPolicy.REPLACE, immediate);\n        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(BackgroundAlertWorker.class, 15, TimeUnit.MINUTES)\n                .setConstraints(constraints).build();\n        manager.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, periodic);\n    }\n}\n''', encoding='utf-8')

replace_once(
    'android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java',
    '            safe.put("threshold", Math.max(1.0, Math.min(10.0, threshold)));\n            org.json.JSONArray holdings',
    '            safe.put("threshold", Math.max(1.0, Math.min(10.0, threshold)));\n            safe.put("ipoEnabled", parsed.optBoolean("ipoEnabled", true));\n            org.json.JSONArray holdings',
)
replace_once(
    'android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java',
    '            BackgroundAlertScheduler.sync(context, safe.optBoolean("enabled", true) && holdings.length() > 0);',
    '            BackgroundAlertScheduler.sync(context, safe.optBoolean("enabled", true));',
)

# 4) Native IPO polling + once-per-ticker de-duplication. This works without PUSH_BACKEND_URL.
replace_once(
    'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java',
    '    private static final String STATE_KEY = "background_alert_state_v1";',
    '    private static final String STATE_KEY = "background_alert_state_v1";\n    private static final String IPO_STATE_KEY = "background_ipo_seen_v1";\n    private static final String IPO_CALENDAR_URL = "https://www.ahlatciyatirim.com.tr/halka-arz?sayfa=1";',
)
replace_once(
    'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java',
    """            JSONArray holdings = config.optJSONArray("holdings");\n            if (holdings == null || holdings.length() == 0) return Result.success();\n\n            double threshold""",
    """            JSONArray holdings = config.optJSONArray("holdings");\n            if (holdings == null) holdings = new JSONArray();\n            boolean ipoEnabled = config.optBoolean("ipoEnabled", true);\n            if (ipoEnabled) {\n                try { checkIpoCalendar(context, prefs); } catch (Exception ignored) {}\n            }\n\n            double threshold""",
)
worker_methods = r'''
    private static void checkIpoCalendar(Context context, SharedPreferences prefs) throws Exception {
        String html = fetchText(IPO_CALENDAR_URL, 3 * 1024 * 1024);
        java.util.regex.Matcher completed = java.util.regex.Pattern.compile("(?i)Tamamlanm(?:ış|is)\\s+Halka\\s+Arzlar").matcher(html);
        String scope = completed.find() ? html.substring(0, completed.start()) : html;
        Set<String> seen = new HashSet<>();
        try {
            JSONArray old = new JSONArray(prefs.getString(IPO_STATE_KEY, "[]"));
            for (int i = 0; i < old.length(); i++) { String t = normalizeTicker(old.optString(i, "")); if (!t.isEmpty()) seen.add(t); }
        } catch (Exception ignored) {}

        java.util.regex.Pattern card = java.util.regex.Pattern.compile(
                "(?is)<a\\b[^>]*href=[\"']([^\"']*/halka-arz/[^\"'?#]+)[\"'][^>]*>([\\s\\S]*?)</a>([\\s\\S]{0,3500}?)(?=<a\\b[^>]*href=[\"'][^\"']*/halka-arz/[^\"']+[\"']|$)");
        java.util.regex.Matcher matcher = card.matcher(scope);
        boolean changed = false;
        while (matcher.find()) {
            String company = stripHtml(matcher.group(2));
            if (company.toLowerCase(java.util.Locale.ROOT).matches(".*(katıl|incele|detay).*")) continue;
            String text = stripHtml(matcher.group(2) + " " + matcher.group(3));
            if (!java.util.regex.Pattern.compile("(?iu)\\b(?:Aktif|Yaklaşan)\\b").matcher(text).find()) continue;
            java.util.regex.Matcher tickerMatch = java.util.regex.Pattern.compile("(?iu)\\b([A-Z0-9]{3,8})\\s+(?:Aktif|Yaklaşan)\\b").matcher(text);
            if (!tickerMatch.find()) continue;
            String ticker = normalizeTicker(tickerMatch.group(1));
            if (ticker.isEmpty() || seen.contains(ticker)) continue;
            java.util.regex.Matcher dateMatch = java.util.regex.Pattern.compile("(?iu)Talep\\s+Tarih(?:leri|i)\\s+(.+?20\\d{2})").matcher(text);
            String dates = dateMatch.find() ? dateMatch.group(1).trim().replace('–','-').replace('—','-') : "";
            showIpoNotification(context, ticker, company, dates);
            seen.add(ticker);
            changed = true;
        }
        if (changed) prefs.edit().putString(IPO_STATE_KEY, toJsonArrayStrings(seen).toString()).apply();
    }

    private static void showIpoNotification(Context context, String ticker, String company, String dates) {
        Map<String, String> data = new HashMap<>();
        data.put("kind", "ipo");
        data.put("ticker", ticker);
        data.put("title", "Halka arz: " + ticker);
        String cleanCompany = company == null || company.trim().isEmpty() ? ticker : company.trim();
        data.put("body", cleanCompany + (dates.isEmpty() ? " halka arz takvimine eklendi." : " için talep tarihleri: " + dates + "."));
        NotificationHelper.show(context, data);
    }

    private static JSONArray toJsonArrayStrings(Set<String> values) {
        JSONArray array = new JSONArray();
        values.stream().sorted().forEach(array::put);
        return array;
    }

    private static String fetchText(String urlText, int maxBytes) throws Exception {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(urlText).openConnection();
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/152 Mobile Safari/537.36");
            connection.setRequestProperty("Accept", "text/html,*/*");
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status);
            return readUtf8(connection.getInputStream(), maxBytes);
        } finally { if (connection != null) connection.disconnect(); }
    }

    private static String stripHtml(String html) {
        return String.valueOf(html == null ? "" : html)
                .replaceAll("(?is)<script\\b[^>]*>.*?</script>", " ")
                .replaceAll("(?is)<style\\b[^>]*>.*?</style>", " ")
                .replaceAll("(?s)<[^>]+>", " ")
                .replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", "\"")
                .replace("&#39;", "'").replaceAll("\\s+", " ").trim();
    }
'''
replace_once(
    'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java',
    '    private static Quote fetchQuote(String ticker) throws Exception {',
    worker_methods + '\n    private static Quote fetchQuote(String ticker) throws Exception {',
)

# Release identity.
replace_once('android/app/build.gradle', 'versionCode 21', 'versionCode 22')
replace_once('android/app/build.gradle', "versionName '2.3.9'", "versionName '2.4.0'")
replace_once('public/index.html', 'v2.3.9 • Build 21', 'v2.4.0 • Build 22')
