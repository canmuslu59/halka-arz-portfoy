from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    return text.replace(old, new, 1)


worker_path = Path('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java')
worker = worker_path.read_text(encoding='utf-8')

worker = replace_once(
    worker,
    'import android.os.Build;\n',
    'import android.os.Build;\nimport android.util.Log;\n',
    'worker Log import',
)
worker = replace_once(
    worker,
    'public class BackgroundAlertWorker extends Worker {\n',
    'public class BackgroundAlertWorker extends Worker {\n    private static final String TAG = "BackgroundAlertWorker";\n',
    'worker TAG',
)
worker = replace_once(
    worker,
    '''            JSONObject config = new JSONObject(configRaw);
            if (!config.optBoolean("enabled", true)) return Result.success();
            JSONArray holdings = config.optJSONArray("holdings");
            if (holdings == null) holdings = new JSONArray();
            boolean ipoEnabled = config.optBoolean("ipoEnabled", true);
            if (ipoEnabled) {
                try { checkIpoCalendar(context, prefs); } catch (Exception ignored) {}
            }
''',
    '''            JSONObject config = new JSONObject(configRaw);
            boolean marketEnabled = config.optBoolean("enabled", true);
            boolean ipoEnabled = config.optBoolean("ipoEnabled", true);
            if (!marketEnabled && !ipoEnabled) return Result.success();

            JSONArray holdings = marketEnabled ? config.optJSONArray("holdings") : new JSONArray();
            if (holdings == null) holdings = new JSONArray();
            boolean retryNeeded = false;
            if (ipoEnabled) {
                try {
                    checkIpoCalendar(context, prefs);
                } catch (Exception error) {
                    Log.w(TAG, "IPO calendar check failed", error);
                    retryNeeded |= BackgroundRetryPolicy.shouldRetry(error);
                }
            }
''',
    'worker IPO-only gate and retry classification',
)
worker = replace_once(
    worker,
    '''            int activeCount = 0;
            int validTodayCount = 0;
            int fetchedCount = 0;
''',
    '''            int activeCount = 0;
            int validTodayCount = 0;
            boolean quoteRetryNeeded = false;
''',
    'worker quote retry state',
)
worker = replace_once(
    worker,
    '''                try {
                    quote = fetchQuote(ticker);
                    fetchedCount += 1;
                } catch (Exception ignored) {
                    continue;
                }
''',
    '''                try {
                    quote = fetchQuote(ticker);
                } catch (Exception error) {
                    Log.w(TAG, "Quote fetch failed for " + ticker, error);
                    quoteRetryNeeded |= BackgroundRetryPolicy.shouldRetry(error);
                    continue;
                }
''',
    'worker quote catch',
)
worker = replace_once(
    worker,
    '''            if (activeCount > 0 && fetchedCount == 0) return Result.retry();
            return Result.success();
        } catch (Exception ignored) {
            return Result.retry();
        }
''',
    '''            if (quoteRetryNeeded) retryNeeded = true;
            if (retryNeeded) return Result.retry();
            return Result.success();
        } catch (Exception error) {
            Log.e(TAG, "Background alert worker failed", error);
            return BackgroundRetryPolicy.shouldRetry(error) ? Result.retry() : Result.success();
        }
''',
    'worker final retry decision',
)
http_old = 'if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status);'
http_new = 'if (status < 200 || status >= 300) throw new BackgroundRetryPolicy.HttpStatusException(status);'
if worker.count(http_old) != 2:
    raise SystemExit(f'worker HTTP status replacement: expected 2 matches, got {worker.count(http_old)}')
worker = worker.replace(http_old, http_new)
worker_path.write_text(worker, encoding='utf-8')

push_path = Path('android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java')
push = push_path.read_text(encoding='utf-8')
push = replace_once(
    push,
    'BackgroundAlertScheduler.sync(context, safe.optBoolean("enabled", true));',
    'BackgroundAlertScheduler.sync(context, safe.optBoolean("enabled", true) || safe.optBoolean("ipoEnabled", true));',
    'push IPO-only scheduling',
)
push_path.write_text(push, encoding='utf-8')

scheduler_path = Path('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java')
scheduler = scheduler_path.read_text(encoding='utf-8')
scheduler = replace_once(
    scheduler,
    'sync(app, config.optBoolean("enabled", true));',
    'sync(app, config.optBoolean("enabled", true) || config.optBoolean("ipoEnabled", true));',
    'startup IPO-only scheduling',
)
scheduler_path.write_text(scheduler, encoding='utf-8')
