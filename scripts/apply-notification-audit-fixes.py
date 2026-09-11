from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    p.write_text(text.replace(old, new), encoding='utf-8')


# 1) Do not wipe persisted native holdings before the local portfolio has hydrated.
replace_once(
    'public/app.js',
    "function syncPushConfiguration() {\n  try { window.AndroidBridge?.syncPushConfig?.(JSON.stringify(pushPayload())); } catch {}\n}",
    "function syncPushConfiguration() {\n  if (!state.portfolio) return;\n  try { window.AndroidBridge?.syncPushConfig?.(JSON.stringify(pushPayload())); } catch {}\n}",
)
replace_once(
    'public/app.js',
    "      state.portfolio = cached;\n      renderPortfolio(cached);\n\n      const fresh = await service.getPortfolio({ refresh:true, force:runForce });",
    "      state.portfolio = cached;\n      renderPortfolio(cached);\n      // Restore native background holdings from durable local state before any network refresh.\n      syncPushConfiguration();\n\n      const fresh = await service.getPortfolio({ refresh:true, force:runForce });",
)

# 2) Keep backend alert semantics aligned with the native worker when one quote is stale/unavailable.
replace_once(
    'backend/alert-engine.js',
    "  const portfolioPct = expected > 0 && valid === expected && previousValue > 0\n    ? ((currentValue - previousValue) / previousValue) * 100\n    : 0;",
    "  const portfolioPct = valid > 0 && previousValue > 0\n    ? ((currentValue - previousValue) / previousValue) * 100\n    : 0;",
)

# 3) Normalize thresholds identically in JS, native worker, and persisted native config.
replace_once(
    'android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java',
    "            double threshold = parsed.optDouble(\"threshold\", 3.0);\n            safe.put(\"threshold\", Math.max(1.0, Math.min(10.0, threshold)));",
    "            double threshold = parsed.optDouble(\"threshold\", 3.0);\n            double normalizedThreshold = Math.round(Math.max(1.0, Math.min(10.0, threshold)) * 2.0) / 2.0;\n            safe.put(\"threshold\", normalizedThreshold);",
)

# 4) Seed the first complete native IPO snapshot instead of replaying all already-existing IPOs.
replace_once(
    'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java',
    "        List<IpoCalendarParser.Entry> entries = mergeIpoEntries(gedikEntries, ahlatciEntries);\n        Set<String> seen = new HashSet<>();",
    "        List<IpoCalendarParser.Entry> entries = mergeIpoEntries(gedikEntries, ahlatciEntries);\n        if (!prefs.contains(IPO_STATE_KEY)) {\n            // Establish a baseline only from a complete dual-source read. A partial outage must retry\n            // rather than making the missing source look like a batch of new IPOs on the next run.\n            if (gedikError != null) throw gedikError;\n            if (ahlatciError != null) throw ahlatciError;\n            Set<String> baseline = new HashSet<>();\n            for (IpoCalendarParser.Entry entry : entries) {\n                if (entry.ticker.isEmpty()) continue;\n                baseline.add(ipoEventKey(entry.ticker, entry.offerDates));\n            }\n            prefs.edit().putString(IPO_STATE_KEY, toJsonArrayStrings(baseline).toString()).apply();\n            return;\n        }\n        Set<String> seen = new HashSet<>();",
)

# 5) Add one native delivery guard shared by foreground, WorkManager, and FCM producers.
helper_path = Path('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java')
helper = helper_path.read_text(encoding='utf-8')
helper = helper.replace(
    'import android.content.Intent;\n',
    'import android.content.Intent;\nimport android.content.SharedPreferences;\n',
    1,
)
helper = helper.replace(
    'import java.util.Map;\n',
    'import org.json.JSONArray;\n\nimport java.time.LocalDate;\nimport java.time.ZoneId;\nimport java.util.HashSet;\nimport java.util.Map;\nimport java.util.Set;\n',
    1,
)
helper = helper.replace(
    '    private static final String CHANNEL_IPO = "new_ipos";\n',
    '    private static final String CHANNEL_IPO = "new_ipos";\n    private static final String PREFS = "halka_arz_portfoy";\n    private static final String DELIVERY_STATE_KEY = "notification_delivery_guard_v1";\n    private static final String DELIVERY_DAY_KEY = DELIVERY_STATE_KEY + "_day";\n    private static final Object DELIVERY_LOCK = new Object();\n',
    1,
)
start = helper.index('    static boolean show(Context context, Map<String, String> data) {')
end = helper.index('    private static String value(Map<String, String> data, String key, String fallback) {', start)
new_show = '''    static boolean show(Context context, Map<String, String> data) {
        String kind = value(data, "kind", "portfolio");
        String ticker = value(data, "ticker", "");
        String title = value(data, "title", "Halka Arz Portföyüm");
        String body = value(data, "body", "Portföyünüzde yeni bir hareket var.");
        String deliveryDay = LocalDate.now(ZoneId.of("Europe/Istanbul")).toString();
        String deliveryKey = kind + "|" + ticker + "|" + body;

        // Foreground JS, WorkManager and FCM can observe the same event independently. Serialize
        // the final delivery boundary so the user receives one notification, while producers that
        // arrive later see an already-delivered event as a successful no-op and can converge state.
        synchronized (DELIVERY_LOCK) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            Set<String> delivered = readDelivered(prefs, deliveryDay);
            if (delivered.contains(deliveryKey)) return true;

            if (Build.VERSION.SDK_INT >= 33
                    && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
            if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;

            ensureChannels(context);
            String channel;
            if ("ipo".equals(kind)) channel = CHANNEL_IPO;
            else if ("ceiling".equals(kind)) channel = CHANNEL_CEILING;
            else if ("floor".equals(kind)) channel = CHANNEL_FLOOR;
            else if ("portfolio".equals(kind)) channel = CHANNEL_RISE;
            else channel = CHANNEL_MARKET;

            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel notificationChannel = manager.getNotificationChannel(channel);
                if (notificationChannel == null || notificationChannel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                    return false;
                }
            }

            Intent intent = new Intent(context, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    .putExtra("push_kind", kind)
                    .putExtra("push_ticker", ticker);
            int requestCode = deliveryKey.hashCode();
            PendingIntent pending = PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channel)
                    .setSmallIcon(com.innative.halkaarz.R.drawable.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setAutoCancel(true)
                    .setContentIntent(pending)
                    .setPriority(NotificationCompat.PRIORITY_HIGH);
            try {
                manager.notify(requestCode, builder.build());
                delivered.add(deliveryKey);
                prefs.edit()
                        .putString(DELIVERY_DAY_KEY, deliveryDay)
                        .putString(DELIVERY_STATE_KEY, toJsonArray(delivered).toString())
                        .commit();
                return true;
            } catch (RuntimeException error) {
                return false;
            }
        }
    }

    private static Set<String> readDelivered(SharedPreferences prefs, String day) {
        Set<String> delivered = new HashSet<>();
        if (!day.equals(prefs.getString(DELIVERY_DAY_KEY, ""))) return delivered;
        try {
            JSONArray array = new JSONArray(prefs.getString(DELIVERY_STATE_KEY, "[]"));
            for (int i = 0; i < array.length(); i++) {
                String value = array.optString(i, "").trim();
                if (!value.isEmpty()) delivered.add(value);
            }
        } catch (Exception ignored) {}
        return delivered;
    }

    private static JSONArray toJsonArray(Set<String> values) {
        JSONArray array = new JSONArray();
        for (String value : values) array.put(value);
        return array;
    }

'''
helper = helper[:start] + new_show + helper[end:]
helper_path.write_text(helper, encoding='utf-8')
