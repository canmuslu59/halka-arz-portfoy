import fs from 'node:fs';

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`Missing expected source block: ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`Expected exactly one source block: ${label}`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

const helperPath = 'android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java';
let helper = fs.readFileSync(helperPath, 'utf8');
helper = replaceOnce(
  helper,
  '} catch (RuntimeException | SecurityException error) {',
  '} catch (RuntimeException error) {',
  'valid RuntimeException catch'
);
fs.writeFileSync(helperPath, helper);

const workerPath = 'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java';
let worker = fs.readFileSync(workerPath, 'utf8');

worker = replaceOnce(
  worker,
  'import androidx.annotation.NonNull;\nimport androidx.core.content.ContextCompat;',
  'import androidx.annotation.NonNull;\nimport androidx.core.app.NotificationManagerCompat;\nimport androidx.core.content.ContextCompat;',
  'NotificationManagerCompat import'
);

worker = replaceOnce(
  worker,
  `        if (Build.VERSION.SDK_INT >= 33\n                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {\n            return Result.success();\n        }\n\n        SharedPreferences prefs = context.getSharedPreferences(PushConfigSync.PREFS, Context.MODE_PRIVATE);`,
  `        if (Build.VERSION.SDK_INT >= 33\n                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {\n            return Result.success();\n        }\n        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {\n            return Result.success();\n        }\n\n        SharedPreferences prefs = context.getSharedPreferences(PushConfigSync.PREFS, Context.MODE_PRIVATE);`,
  'system notification early return'
);

worker = replaceOnce(
  worker,
  `                if (quote.current >= ceiling - ceilingTolerance && !tickerLimits.optBoolean("ceiling", false)) {\n                    showLimitNotification(context, "ceiling", ticker);\n                    tickerLimits.put("ceiling", true);\n                }\n                if (quote.current <= floor + floorTolerance && !tickerLimits.optBoolean("floor", false)) {\n                    showLimitNotification(context, "floor", ticker);\n                    tickerLimits.put("floor", true);\n                }`,
  `                if (quote.current >= ceiling - ceilingTolerance && !tickerLimits.optBoolean("ceiling", false)) {\n                    if (showLimitNotification(context, "ceiling", ticker)) {\n                        tickerLimits.put("ceiling", true);\n                    }\n                }\n                if (quote.current <= floor + floorTolerance && !tickerLimits.optBoolean("floor", false)) {\n                    if (showLimitNotification(context, "floor", ticker)) {\n                        tickerLimits.put("floor", true);\n                    }\n                }`,
  'limit delivery-gated dedupe'
);

worker = replaceOnce(
  worker,
  `                        showPortfolioNotification(context, level);\n                        portfolioDelivered.add(level);`,
  `                        if (showPortfolioNotification(context, level)) {\n                            portfolioDelivered.add(level);\n                        }`,
  'portfolio delivery-gated dedupe'
);

worker = replaceOnce(
  worker,
  '    private static void showLimitNotification(Context context, String kind, String ticker) {',
  '    private static boolean showLimitNotification(Context context, String kind, String ticker) {',
  'limit notifier boolean return type'
);
worker = replaceOnce(
  worker,
  `        NotificationHelper.show(context, data);\n    }\n\n    private static void showPortfolioNotification(Context context, double level) {`,
  `        return NotificationHelper.show(context, data);\n    }\n\n    private static boolean showPortfolioNotification(Context context, double level) {`,
  'limit notifier return and portfolio boolean return type'
);
worker = replaceOnce(
  worker,
  `        data.put("body", "Toplam portföy bugün +%" + formatLevel(level) + " seviyesini geçti.");\n        NotificationHelper.show(context, data);\n    }`,
  `        data.put("body", "Toplam portföy bugün +%" + formatLevel(level) + " seviyesini geçti.");\n        return NotificationHelper.show(context, data);\n    }`,
  'portfolio notifier return'
);

worker = replaceOnce(
  worker,
  `            for (int i = 0; i < old.length(); i++) {\n                String ticker = normalizeTicker(old.optString(i, ""));\n                if (!ticker.isEmpty()) seen.add(ticker);\n            }`,
  `            for (int i = 0; i < old.length(); i++) {\n                String value = old.optString(i, "").trim();\n                if (!value.isEmpty()) seen.add(value);\n            }`,
  'preserve event identity from persisted IPO state'
);

worker = replaceOnce(
  worker,
  `        boolean changed = false;\n        for (IpoCalendarParser.Entry entry : IpoCalendarParser.parse(html)) {\n            if (entry.ticker.isEmpty() || seen.contains(entry.ticker)) continue;\n            showIpoNotification(context, entry.ticker, entry.company, entry.offerDates);\n            seen.add(entry.ticker);\n            changed = true;\n        }\n        if (changed) prefs.edit().putString(IPO_STATE_KEY, toJsonArrayStrings(seen).toString()).apply();\n    }\n\n    private static void showIpoNotification(Context context, String ticker, String company, String dates) {`,
  `        boolean changed = false;\n        for (IpoCalendarParser.Entry entry : IpoCalendarParser.parse(html)) {\n            if (entry.ticker.isEmpty()) continue;\n            String eventKey = ipoEventKey(entry.ticker, entry.offerDates);\n            if (seen.contains(eventKey)) continue;\n\n            // Migrate the old ticker-only identity without replaying an already seen offering.\n            if (seen.remove(entry.ticker)) {\n                seen.add(eventKey);\n                changed = true;\n                continue;\n            }\n\n            if (showIpoNotification(context, entry.ticker, entry.company, entry.offerDates)) {\n                seen.add(eventKey);\n                changed = true;\n            }\n        }\n        if (changed) prefs.edit().putString(IPO_STATE_KEY, toJsonArrayStrings(seen).toString()).apply();\n    }\n\n    private static String ipoEventKey(String ticker, String offerDates) {\n        String normalizedTicker = normalizeTicker(ticker);\n        String normalizedDates = String.valueOf(offerDates == null ? "" : offerDates).trim().replaceAll("\\\\s+", " ");\n        return normalizedTicker + "|" + normalizedDates;\n    }\n\n    private static boolean showIpoNotification(Context context, String ticker, String company, String dates) {`,
  'IPO event identity and delivery-gated dedupe'
);

worker = replaceOnce(
  worker,
  `        data.put("body", cleanCompany + (dates.isEmpty() ? " halka arz takvimine eklendi." : " için talep tarihleri: " + dates + "."));\n        NotificationHelper.show(context, data);\n    }`,
  `        data.put("body", cleanCompany + (dates.isEmpty() ? " halka arz takvimine eklendi." : " için talep tarihleri: " + dates + "."));\n        return NotificationHelper.show(context, data);\n    }`,
  'IPO notifier return'
);

fs.writeFileSync(workerPath, worker);
console.log('Applied deterministic native notification hardening.');
