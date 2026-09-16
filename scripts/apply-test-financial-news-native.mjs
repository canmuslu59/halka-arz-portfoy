import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.replace(needle, () => replacement);
}

const gradlePath = 'android/app/build.gradle';
let gradle = readFileSync(gradlePath, 'utf8');
gradle = replaceOnce(
  gradle,
  `        buildConfigField 'String', 'PUSH_BACKEND_URL', '"' + (System.getenv('PUSH_BACKEND_URL') ?: '') + '"'`,
  `        buildConfigField 'String', 'PUSH_BACKEND_URL', '"' + (System.getenv('PUSH_BACKEND_URL') ?: '') + '"'\n        buildConfigField 'String', 'NEWS_BACKEND_URL', '"' + (System.getenv('NEWS_BACKEND_URL') ?: '') + '"'`,
  'news BuildConfig field'
);
writeFileSync(gradlePath, gradle);

const policyPath = 'android/app/src/main/java/com/innative/halkaarz/NativeHttpPolicy.java';
let policy = readFileSync(policyPath, 'utf8');
policy = replaceOnce(
  policy,
  `            "oyakyatirim.com.tr",\n            "www.oyakyatirim.com.tr"`,
  `            "oyakyatirim.com.tr",\n            "www.oyakyatirim.com.tr",\n            "halka-arz-portfoy-news-test.grass-airboat.workers.dev"`,
  'news backend allowlist'
);
writeFileSync(policyPath, policy);

const helperPath = 'android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java';
let helper = readFileSync(helperPath, 'utf8');
helper = replaceOnce(
  helper,
  `    private static final String CHANNEL_IPO = "new_ipos";`,
  `    private static final String CHANNEL_IPO = "new_ipos";\n    private static final String CHANNEL_FINANCIAL_NEWS = "financial_breaking_v1";`,
  'financial news channel constant'
);
helper = replaceOnce(
  helper,
  `        NotificationChannel ipo = new NotificationChannel(CHANNEL_IPO, "Yeni halka arzlar", NotificationManager.IMPORTANCE_DEFAULT);\n        ipo.setDescription("Yeni açıklanan halka arz bildirimleri");`,
  `        NotificationChannel ipo = new NotificationChannel(CHANNEL_IPO, "Yeni halka arzlar", NotificationManager.IMPORTANCE_DEFAULT);\n        ipo.setDescription("Yeni açıklanan halka arz bildirimleri");\n        NotificationChannel financialNews = new NotificationChannel(CHANNEL_FINANCIAL_NEWS, "Finansal son dakika", NotificationManager.IMPORTANCE_HIGH);\n        financialNews.setDescription("Yalnızca kaynak tarafından son dakika olarak işaretlenen finansal haberler");`,
  'financial news channel creation'
);
helper = replaceOnce(
  helper,
  `        manager.createNotificationChannel(floor);\n        manager.createNotificationChannel(ipo);`,
  `        manager.createNotificationChannel(floor);\n        manager.createNotificationChannel(ipo);\n        manager.createNotificationChannel(financialNews);`,
  'financial news channel registration'
);
helper = replaceOnce(
  helper,
  `                putChannelState(channels, manager, "ipo", CHANNEL_IPO);`,
  `                putChannelState(channels, manager, "ipo", CHANNEL_IPO);\n                putChannelState(channels, manager, "financialBreaking", CHANNEL_FINANCIAL_NEWS);`,
  'financial news diagnostics'
);
helper = replaceOnce(
  helper,
  `        if ("ipo".equals(kind)) channel = CHANNEL_IPO;\n        else if ("ceiling".equals(kind)) channel = CHANNEL_CEILING;`,
  `        if ("ipo".equals(kind)) channel = CHANNEL_IPO;\n        else if ("financial_breaking".equals(kind)) channel = CHANNEL_FINANCIAL_NEWS;\n        else if ("ceiling".equals(kind)) channel = CHANNEL_CEILING;`,
  'financial news channel routing'
);
writeFileSync(helperPath, helper);

const workerPath = 'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java';
let worker = readFileSync(workerPath, 'utf8');
worker = replaceOnce(
  worker,
  `    private static final String IPO_STATE_KEY = "background_ipo_seen_v1";`,
  `    private static final String IPO_STATE_KEY = "background_ipo_seen_v1";\n    private static final String NEWS_BREAKING_STATE_KEY = "financial_breaking_seen_v1";`,
  'breaking news state key'
);
worker = replaceOnce(
  worker,
  `        SharedPreferences prefs = context.getSharedPreferences(PushConfigSync.PREFS, Context.MODE_PRIVATE);\n        String configRaw = prefs.getString(PushConfigSync.CONFIG_KEY, "");`,
  `        SharedPreferences prefs = context.getSharedPreferences(PushConfigSync.PREFS, Context.MODE_PRIVATE);\n        try {\n            checkFinancialBreakingNews(context, prefs);\n        } catch (Exception error) {\n            Log.w(TAG, "Financial breaking news check failed", error);\n        }\n        String configRaw = prefs.getString(PushConfigSync.CONFIG_KEY, "");`,
  'breaking news poll hook'
);
const readStateMarker = '    private static JSONObject readState(SharedPreferences prefs, String day) {';
const readStateIndex = worker.indexOf(readStateMarker);
if (readStateIndex < 0) throw new Error('readState marker not found');
const newsMethod = `    private static void checkFinancialBreakingNews(Context context, SharedPreferences prefs) throws Exception {
        String base = BuildConfig.NEWS_BACKEND_URL == null ? "" : BuildConfig.NEWS_BACKEND_URL.trim();
        if (base.isEmpty()) return;
        String body = fetchBody(
                base.replaceAll("/+$", "") + "/v1/news?breaking=1&limit=20",
                512 * 1024,
                "application/json,text/plain,*/*",
                "InnativePortfolioNewsTest/1.0"
        );
        JSONObject root = new JSONObject(body);
        JSONArray items = root.optJSONArray("items");
        if (items == null) return;
        java.util.LinkedHashSet<String> seen = new java.util.LinkedHashSet<>();
        try {
            JSONArray stored = new JSONArray(prefs.getString(NEWS_BREAKING_STATE_KEY, "[]"));
            for (int i = 0; i < stored.length(); i++) {
                String id = stored.optString(i, "").trim();
                if (!id.isEmpty()) seen.add(id);
            }
        } catch (Exception ignored) {}
        boolean changed = false;
        for (int i = items.length() - 1; i >= 0; i--) {
            JSONObject item = items.optJSONObject(i);
            if (item == null || !item.optBoolean("breaking", false)) continue;
            String id = item.optString("id", "").trim();
            String title = item.optString("title", "").trim();
            if (id.isEmpty() || title.isEmpty() || seen.contains(id)) continue;
            Map<String, String> data = new HashMap<>();
            data.put("kind", "financial_breaking");
            data.put("ticker", id);
            data.put("title", "Finansal Son Dakika");
            data.put("body", title);
            if (NotificationHelper.show(context, data)) {
                seen.add(id);
                changed = true;
            }
        }
        while (seen.size() > 300) seen.remove(seen.iterator().next());
        if (changed) prefs.edit().putString(NEWS_BREAKING_STATE_KEY, toJsonArrayStrings(seen).toString()).apply();
    }

`;
worker = worker.slice(0, readStateIndex) + newsMethod + worker.slice(readStateIndex);
writeFileSync(workerPath, worker);

console.log('Applied isolated test-native financial breaking news polling and notification channel patch.');
