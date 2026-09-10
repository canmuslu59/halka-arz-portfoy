package com.innative.halkaarz;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class BackgroundAlertWorker extends Worker {
    private static final String TAG = "BackgroundAlertWorker";
    private static final String STATE_KEY = "background_alert_state_v1";
    private static final String IPO_STATE_KEY = "background_ipo_seen_v1";
    private static final String GEDIK_IPO_CALENDAR_URL = "https://gedik.com/halka-arz-takvimi";
    private static final String AHLATCI_IPO_CALENDAR_URL = "https://www.ahlatciyatirim.com.tr/halka-arz?sayfa=1";
    private static final ZoneId ISTANBUL = ZoneId.of("Europe/Istanbul");
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    private static final int MAX_REDIRECTS = 5;

    public BackgroundAlertWorker(@NonNull Context appContext, @NonNull WorkerParameters params) {
        super(appContext, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return Result.success();
        }
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            return Result.success();
        }

        SharedPreferences prefs = context.getSharedPreferences(PushConfigSync.PREFS, Context.MODE_PRIVATE);
        String configRaw = prefs.getString(PushConfigSync.CONFIG_KEY, "");
        if (configRaw == null || configRaw.trim().isEmpty()) return Result.success();

        try {
            JSONObject config = new JSONObject(configRaw);
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

            double threshold = clampThreshold(config.optDouble("threshold", 3.0));
            String day = LocalDate.now(ISTANBUL).toString();
            JSONObject state = readState(prefs, day);
            JSONObject limits = state.optJSONObject("limits");
            if (limits == null) limits = new JSONObject();
            Set<Double> portfolioDelivered = deliveredLevels(state.optJSONArray("portfolio"));

            double previousValue = 0.0;
            double currentValue = 0.0;
            int activeCount = 0;
            int validTodayCount = 0;
            boolean quoteRetryNeeded = false;

            for (int i = 0; i < holdings.length(); i++) {
                JSONObject item = holdings.optJSONObject(i);
                if (item == null) continue;
                String ticker = normalizeTicker(item.optString("ticker", ""));
                double lots = item.optDouble("lots", 0.0);
                if (ticker.isEmpty() || !(lots > 0)) continue;
                activeCount += 1;

                Quote quote;
                try {
                    quote = fetchQuote(ticker);
                } catch (Exception error) {
                    Log.w(TAG, "Quote fetch failed for " + ticker, error);
                    quoteRetryNeeded |= BackgroundRetryPolicy.shouldRetry(error);
                    continue;
                }
                if (quote == null || !day.equals(quote.marketDate) || !(quote.current > 0) || !(quote.previousClose > 0)) continue;
                validTodayCount += 1;

                JSONObject tickerLimits = limits.optJSONObject(ticker);
                if (tickerLimits == null) tickerLimits = new JSONObject();
                double ceiling = ceilingPrice(quote.previousClose);
                double floor = floorPrice(quote.previousClose);
                double ceilingTolerance = Math.max(0.005, tickSize(ceiling) / 2.0 + 1e-8);
                double floorTolerance = Math.max(0.005, tickSize(floor) / 2.0 + 1e-8);

                if (quote.current >= ceiling - ceilingTolerance && !tickerLimits.optBoolean("ceiling", false)) {
                    if (showLimitNotification(context, "ceiling", ticker)) {
                        tickerLimits.put("ceiling", true);
                    }
                }
                if (quote.current <= floor + floorTolerance && !tickerLimits.optBoolean("floor", false)) {
                    if (showLimitNotification(context, "floor", ticker)) {
                        tickerLimits.put("floor", true);
                    }
                }
                limits.put(ticker, tickerLimits);

                previousValue += quote.previousClose * lots;
                currentValue += quote.current * lots;
            }

            if (activeCount > 0 && validTodayCount == activeCount && previousValue > 0) {
                double portfolioPct = ((currentValue - previousValue) / previousValue) * 100.0;
                if (portfolioPct > 0) {
                    int reached = (int)Math.floor((portfolioPct + 1e-9) / threshold);
                    for (int index = 1; index <= reached; index++) {
                        double level = roundHalf(index * threshold);
                        if (portfolioDelivered.contains(level)) continue;
                        if (showPortfolioNotification(context, level)) {
                            portfolioDelivered.add(level);
                        }
                    }
                }
            }

            state.put("day", day);
            state.put("limits", limits);
            state.put("portfolio", toJsonArray(portfolioDelivered));
            prefs.edit().putString(STATE_KEY, state.toString()).apply();

            if (quoteRetryNeeded) retryNeeded = true;
            if (retryNeeded) return Result.retry();
            return Result.success();
        } catch (Exception error) {
            Log.e(TAG, "Background alert worker failed", error);
            return BackgroundRetryPolicy.shouldRetry(error) ? Result.retry() : Result.success();
        }
    }

    private static JSONObject readState(SharedPreferences prefs, String day) {
        String raw = prefs.getString(STATE_KEY, "");
        try {
            JSONObject parsed = new JSONObject(raw == null ? "{}" : raw);
            if (day.equals(parsed.optString("day", ""))) return parsed;
        } catch (Exception ignored) {}
        JSONObject fresh = new JSONObject();
        try {
            fresh.put("day", day);
            fresh.put("limits", new JSONObject());
            fresh.put("portfolio", new JSONArray());
        } catch (Exception ignored) {}
        return fresh;
    }

    private static Set<Double> deliveredLevels(JSONArray values) {
        Set<Double> result = new HashSet<>();
        if (values == null) return result;
        for (int i = 0; i < values.length(); i++) {
            double value = values.optDouble(i, Double.NaN);
            if (Double.isFinite(value)) result.add(value);
        }
        return result;
    }

    private static JSONArray toJsonArray(Set<Double> values) {
        JSONArray array = new JSONArray();
        values.stream().sorted().forEach(array::put);
        return array;
    }

    private static boolean showLimitNotification(Context context, String kind, String ticker) {
        Map<String, String> data = new HashMap<>();
        data.put("kind", kind);
        data.put("ticker", ticker);
        if ("ceiling".equals(kind)) {
            data.put("title", ticker + " tavan yaptı");
            data.put("body", ticker + " bugün tavan fiyatına ulaştı.");
        } else {
            data.put("title", ticker + " taban yaptı");
            data.put("body", ticker + " bugün taban fiyatına ulaştı.");
        }
        return NotificationHelper.show(context, data);
    }

    private static boolean showPortfolioNotification(Context context, double level) {
        Map<String, String> data = new HashMap<>();
        data.put("kind", "portfolio");
        data.put("ticker", "");
        data.put("title", "Portföy yükselişi");
        data.put("body", "Toplam portföy bugün +%" + formatLevel(level) + " seviyesini geçti.");
        return NotificationHelper.show(context, data);
    }

    private static void checkIpoCalendar(Context context, SharedPreferences prefs) throws Exception {
        List<IpoCalendarParser.Entry> entries;
        try {
            String html = fetchText(GEDIK_IPO_CALENDAR_URL, 3 * 1024 * 1024);
            entries = IpoCalendarParser.parseGedik(html);
        } catch (Exception currentSourceError) {
            try {
                String fallbackHtml = fetchText(AHLATCI_IPO_CALENDAR_URL, 3 * 1024 * 1024);
                entries = IpoCalendarParser.parse(fallbackHtml);
            } catch (Exception fallbackError) {
                fallbackError.addSuppressed(currentSourceError);
                throw fallbackError;
            }
        }

        Set<String> seen = new HashSet<>();
        try {
            JSONArray old = new JSONArray(prefs.getString(IPO_STATE_KEY, "[]"));
            for (int i = 0; i < old.length(); i++) {
                String value = old.optString(i, "").trim();
                if (!value.isEmpty()) seen.add(value);
            }
        } catch (Exception ignored) {}

        boolean changed = false;
        for (IpoCalendarParser.Entry entry : entries) {
            if (entry.ticker.isEmpty()) continue;
            String eventKey = ipoEventKey(entry.ticker, entry.offerDates);
            if (seen.contains(eventKey)) continue;

            // Migrate the old ticker-only identity without replaying an already seen offering.
            if (seen.remove(entry.ticker)) {
                seen.add(eventKey);
                changed = true;
                continue;
            }

            if (showIpoNotification(context, entry.ticker, entry.company, entry.offerDates)) {
                seen.add(eventKey);
                changed = true;
            }
        }
        if (changed) prefs.edit().putString(IPO_STATE_KEY, toJsonArrayStrings(seen).toString()).apply();
    }

    private static String ipoEventKey(String ticker, String offerDates) {
        String normalizedTicker = normalizeTicker(ticker);
        String normalizedDates = String.valueOf(offerDates == null ? "" : offerDates).trim().replaceAll("\\s+", " ");
        return normalizedTicker + "|" + normalizedDates;
    }

    private static boolean showIpoNotification(Context context, String ticker, String company, String dates) {
        Map<String, String> data = new HashMap<>();
        data.put("kind", "ipo");
        data.put("ticker", ticker);
        data.put("title", "Halka arz: " + ticker);
        String cleanCompany = company == null || company.trim().isEmpty() ? ticker : company.trim();
        data.put("body", cleanCompany + (dates.isEmpty() ? " halka arz takvimine eklendi." : " için talep tarihleri: " + dates + "."));
        return NotificationHelper.show(context, data);
    }

    private static JSONArray toJsonArrayStrings(Set<String> values) {
        JSONArray array = new JSONArray();
        values.stream().sorted().forEach(array::put);
        return array;
    }

    private static String fetchText(String urlText, int maxBytes) throws Exception {
        return fetchBody(
                urlText,
                maxBytes,
                "text/html,*/*",
                "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/152 Mobile Safari/537.36"
        );
    }

    private static String fetchBody(String urlText, int maxBytes, String accept, String userAgent) throws Exception {
        URL url = NativeHttpPolicy.requireAllowed(urlText);
        int redirectCount = 0;
        while (true) {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(12000);
                connection.setReadTimeout(12000);
                connection.setRequestMethod("GET");
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("User-Agent", userAgent);
                connection.setRequestProperty("Accept", accept);
                int status = connection.getResponseCode();
                if (isRedirectStatus(status)) {
                    if (redirectCount >= MAX_REDIRECTS) throw new IllegalStateException("Çok fazla yönlendirme.");
                    URL nextUrl = NativeHttpPolicy.resolveRedirect(url, connection.getHeaderField("Location"));
                    url = nextUrl;
                    redirectCount += 1;
                    continue;
                }
                if (status < 200 || status >= 300) throw new BackgroundRetryPolicy.HttpStatusException(status);
                return readUtf8(connection.getInputStream(), maxBytes);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }
    }

    private static boolean isRedirectStatus(int status) {
        return status == HttpURLConnection.HTTP_MOVED_PERM
                || status == HttpURLConnection.HTTP_MOVED_TEMP
                || status == HttpURLConnection.HTTP_SEE_OTHER
                || status == 307
                || status == 308;
    }

    private static String stripHtml(String html) {
        return String.valueOf(html == null ? "" : html)
                .replaceAll("(?is)<script\\b[^>]*>.*?</script>", " ")
                .replaceAll("(?is)<style\\b[^>]*>.*?</style>", " ")
                .replaceAll("(?s)<[^>]+>", " ")
                .replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", "\"")
                .replace("&#39;", "'").replaceAll("\\s+", " ").trim();
    }

    private static Quote fetchQuote(String ticker) throws Exception {
        String urlText = "https://query1.finance.yahoo.com/v8/finance/chart/" + ticker + ".IS?range=5d&interval=5m&includePrePost=false&events=div%2Csplits";
        String body = fetchBody(
                urlText,
                MAX_RESPONSE_BYTES,
                "application/json,text/plain,*/*",
                "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36"
        );
        JSONObject root = new JSONObject(body);
        JSONObject result = root.optJSONObject("chart") == null ? null : root.optJSONObject("chart").optJSONArray("result") == null
                ? null : root.optJSONObject("chart").optJSONArray("result").optJSONObject(0);
        if (result == null) throw new IllegalStateException("Fiyat verisi bulunamadı.");
        JSONObject meta = result.optJSONObject("meta");
        if (meta == null) meta = new JSONObject();
        double current = finite(meta.optDouble("regularMarketPrice", Double.NaN));
        double previousClose = finite(meta.optDouble("previousClose", Double.NaN));
        if (!Double.isFinite(previousClose)) previousClose = finite(meta.optDouble("chartPreviousClose", Double.NaN));
        long marketEpoch = meta.optLong("regularMarketTime", 0L);

        JSONArray timestamps = result.optJSONArray("timestamp");
        JSONObject indicators = result.optJSONObject("indicators");
        JSONArray quoteArray = indicators == null ? null : indicators.optJSONArray("quote");
        JSONObject quote = quoteArray == null ? null : quoteArray.optJSONObject(0);
        JSONArray closes = quote == null ? null : quote.optJSONArray("close");
        if (closes != null) {
            for (int i = closes.length() - 1; i >= 0; i--) {
                double close = finite(closes.optDouble(i, Double.NaN));
                if (!Double.isFinite(close)) continue;
                if (!Double.isFinite(current)) current = close;
                if (marketEpoch <= 0 && timestamps != null) marketEpoch = timestamps.optLong(i, 0L);
                break;
            }
        }
        if (!(current > 0) || !(previousClose > 0) || marketEpoch <= 0) throw new IllegalStateException("Eksik fiyat verisi.");
        String marketDate = Instant.ofEpochSecond(marketEpoch).atZone(ISTANBUL).toLocalDate().toString();
        return new Quote(current, previousClose, marketDate);
    }

    private static double finite(double value) {
        return Double.isFinite(value) ? value : Double.NaN;
    }

    private static double clampThreshold(double value) {
        double clamped = Math.max(1.0, Math.min(10.0, Double.isFinite(value) ? value : 3.0));
        return roundHalf(clamped);
    }

    private static double roundHalf(double value) {
        return Math.round(value * 2.0) / 2.0;
    }

    private static String normalizeTicker(String value) {
        return String.valueOf(value == null ? "" : value)
                .trim().toUpperCase(java.util.Locale.ROOT)
                .replace(".IS", "")
                .replaceAll("[^A-Z0-9]", "");
    }

    private static double tickSize(double price) {
        if (!(price > 0)) return 0.01;
        if (price < 20) return 0.01;
        if (price < 50) return 0.02;
        if (price < 100) return 0.05;
        if (price < 250) return 0.1;
        if (price < 500) return 0.25;
        if (price < 1000) return 0.5;
        if (price < 2500) return 1.0;
        return 2.5;
    }

    private static double ceilingPrice(double base) {
        double theoretical = base * 1.10;
        double step = tickSize(theoretical);
        return roundPrice(Math.floor((theoretical + 1e-9) / step) * step);
    }

    private static double floorPrice(double base) {
        double theoretical = base * 0.90;
        double step = tickSize(theoretical);
        return roundPrice(Math.ceil((theoretical - 1e-9) / step) * step);
    }

    private static double roundPrice(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static String formatLevel(double level) {
        if (Math.abs(level - Math.rint(level)) < 1e-9) return String.valueOf((long)Math.rint(level));
        return String.valueOf(level).replace('.', ',');
    }

    private static String readUtf8(InputStream input, int maxBytes) throws Exception {
        try (BufferedInputStream buffered = new BufferedInputStream(input); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            int total = 0;
            int read;
            while ((read = buffered.read(chunk)) != -1) {
                total += read;
                if (total > maxBytes) throw new IllegalStateException("Yanıt çok büyük.");
                output.write(chunk, 0, read);
            }
            return output.toString("UTF-8");
        }
    }

    private static final class Quote {
        final double current;
        final double previousClose;
        final String marketDate;

        Quote(double current, double previousClose, String marketDate) {
            this.current = current;
            this.previousClose = previousClose;
            this.marketDate = marketDate;
        }
    }
}
