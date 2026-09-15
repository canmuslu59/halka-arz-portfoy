package com.innative.halkaarz;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

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
import java.time.ZonedDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Narrow fallback for portfolio threshold alerts only.
 *
 * After 20:00 Istanbul time it persists each active holding's finalized market
 * close. On the next trading session that persisted close may replace a missing
 * external previous-close reference for portfolio percentage calculations.
 * Tavan/taban logic remains exclusively in BackgroundAlertWorker and is not
 * calculated here.
 */
public final class PortfolioCloseFallbackWorker extends Worker {
    private static final String CLOSES_KEY = "portfolio_close_fallback_closes_v1";
    private static final String STATE_KEY = "portfolio_close_fallback_state_v1";
    private static final ZoneId ISTANBUL = ZoneId.of("Europe/Istanbul");
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

    public PortfolioCloseFallbackWorker(@NonNull Context appContext, @NonNull WorkerParameters params) {
        super(appContext, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PushConfigSync.PREFS, Context.MODE_PRIVATE);
        JSONObject config = parseObject(prefs.getString(PushConfigSync.CONFIG_KEY, ""));
        if (config == null || !config.optBoolean("enabled", true)) return Result.success();

        JSONArray holdings = config.optJSONArray("holdings");
        if (holdings == null || holdings.length() == 0) return Result.success();

        ZonedDateTime localNow = ZonedDateTime.now(ISTANBUL);
        String day = localNow.toLocalDate().toString();
        JSONObject cachedCloses = parseObject(prefs.getString(CLOSES_KEY, "{}"));
        if (cachedCloses == null) cachedCloses = new JSONObject();

        if (localNow.getHour() >= 20) {
            return captureClosingPrices(prefs, cachedCloses, holdings, day, localNow.getHour());
        }

        if (!notificationsAllowed(context)) return Result.success();
        return evaluatePortfolio(context, prefs, cachedCloses, holdings, day, config.optDouble("threshold", 3.0));
    }

    private static Result captureClosingPrices(
            SharedPreferences prefs,
            JSONObject cachedCloses,
            JSONArray holdings,
            String day,
            int localHour) {
        boolean changed = false;
        boolean retry = false;
        for (int i = 0; i < holdings.length(); i++) {
            JSONObject item = holdings.optJSONObject(i);
            if (item == null) continue;
            String ticker = normalizeTicker(item.optString("ticker", ""));
            double lots = Math.max(0.0, item.optDouble("lots", 0.0));
            if (ticker.isEmpty() || !(lots > 0)) continue;
            try {
                Quote quote = fetchQuote(ticker);
                if (quote == null || !MarketCloseFallback.shouldCapture(quote.marketDate, day, localHour, quote.current)) continue;
                JSONObject snapshot = new JSONObject();
                snapshot.put("day", day);
                snapshot.put("close", quote.current);
                cachedCloses.put(ticker, snapshot);
                changed = true;
            } catch (Exception error) {
                retry |= BackgroundRetryPolicy.shouldRetry(error);
            }
        }
        if (changed) prefs.edit().putString(CLOSES_KEY, cachedCloses.toString()).commit();
        return retry ? Result.retry() : Result.success();
    }

    private static Result evaluatePortfolio(
            Context context,
            SharedPreferences prefs,
            JSONObject cachedCloses,
            JSONArray holdings,
            String day,
            double rawThreshold) {
        double previousValue = 0.0;
        double dailyProfitValue = 0.0;
        int expected = 0;
        int valid = 0;
        boolean retry = false;
        boolean hasTodaySales = false;
        List<Map<Long, Double>> positionSamples = new ArrayList<>();

        long monitoringSince = prefs.getLong(PushConfigSync.MONITORING_SINCE_KEY, 0L);
        if (monitoringSince <= 0L) monitoringSince = System.currentTimeMillis();

        for (int i = 0; i < holdings.length(); i++) {
            JSONObject item = holdings.optJSONObject(i);
            if (item == null) continue;
            String ticker = normalizeTicker(item.optString("ticker", ""));
            double currentLots = Math.max(0.0, item.optDouble("lots", 0.0));
            double ipoPrice = item.optDouble("ipoPrice", 0.0);
            JSONArray sales = item.optJSONArray("sales");
            if (sales == null) sales = new JSONArray();

            double soldTodayLots = 0.0;
            double todayWithholdingTax = 0.0;
            for (int saleIndex = 0; saleIndex < sales.length(); saleIndex++) {
                JSONObject sale = sales.optJSONObject(saleIndex);
                if (sale == null || !day.equals(sale.optString("date", ""))) continue;
                double saleLots = sale.optDouble("lots", 0.0);
                double salePrice = sale.optDouble("price", 0.0);
                if (!(saleLots > 0) || !(salePrice > 0)) continue;
                soldTodayLots += saleLots;
                if (ipoPrice > 0) {
                    todayWithholdingTax += Math.max(0.0, saleLots * (salePrice - ipoPrice)) * 0.175;
                }
            }

            double dailyBaseLots = currentLots + soldTodayLots;
            if (ticker.isEmpty() || !(dailyBaseLots > 0)) continue;
            expected += 1;

            Quote quote;
            try {
                quote = fetchQuote(ticker);
            } catch (Exception error) {
                retry |= BackgroundRetryPolicy.shouldRetry(error);
                continue;
            }
            if (quote == null || !day.equals(quote.marketDate) || !(quote.current > 0)) continue;

            JSONObject snapshot = cachedCloses.optJSONObject(ticker);
            String cachedDay = snapshot == null ? "" : snapshot.optString("day", "");
            double cachedClose = snapshot == null ? Double.NaN : snapshot.optDouble("close", Double.NaN);
            if (quote.previousSessionDate == null || !quote.previousSessionDate.equals(cachedDay)) continue;
            double previousClose = MarketCloseFallback.choosePreviousClose(Double.NaN, cachedDay, cachedClose, day);
            if (!(previousClose > 0) || !Double.isFinite(previousClose)) continue;

            valid += 1;
            if (soldTodayLots > 0) {
                hasTodaySales = true;
            } else if (currentLots > 0) {
                Map<Long, Double> samples = new TreeMap<>();
                for (Map.Entry<Long, Double> sample : quote.sessionCloses.entrySet()) {
                    samples.put(sample.getKey(), sample.getValue() * currentLots);
                }
                positionSamples.add(samples);
            }

            double saleDayGain = 0.0;
            for (int saleIndex = 0; saleIndex < sales.length(); saleIndex++) {
                JSONObject sale = sales.optJSONObject(saleIndex);
                if (sale == null || !day.equals(sale.optString("date", ""))) continue;
                double saleLots = sale.optDouble("lots", 0.0);
                double salePrice = sale.optDouble("price", 0.0);
                if (saleLots > 0 && salePrice > 0) saleDayGain += saleLots * (salePrice - previousClose);
            }

            previousValue += previousClose * dailyBaseLots;
            dailyProfitValue += currentLots * (quote.current - previousClose) + saleDayGain - todayWithholdingTax;
        }

        if (expected == 0 || valid != expected || !(previousValue > 0)) {
            return retry ? Result.retry() : Result.success();
        }

        double threshold = Math.round(Math.max(1.0, Math.min(10.0, Double.isFinite(rawThreshold) ? rawThreshold : 3.0)) * 2.0) / 2.0;
        double portfolioPct = dailyProfitValue / previousValue * 100.0;
        JSONObject state = readState(prefs, day);
        Set<Double> delivered = deliveredLevels(state.optJSONArray("portfolio"));

        List<Double> observed = hasTodaySales
                ? new ArrayList<>()
                : PortfolioAlertRules.sampledPercentages(positionSamples, previousValue, (monitoringSince + 999L) / 1000L);
        observed.add(portfolioPct);
        for (double observedPercent : observed) {
            for (double level : PortfolioAlertRules.levels(observedPercent, threshold)) {
                if (delivered.contains(level)) continue;
                if (showPortfolioNotification(context, level)) delivered.add(level);
            }
        }

        try {
            state.put("day", day);
            state.put("portfolio", toJsonArray(delivered));
            prefs.edit().putString(STATE_KEY, state.toString()).commit();
        } catch (Exception ignored) {}
        return retry ? Result.retry() : Result.success();
    }

    private static boolean notificationsAllowed(Context context) {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    private static boolean showPortfolioNotification(Context context, double level) {
        Map<String, String> data = new HashMap<>();
        boolean falling = level < 0;
        data.put("kind", falling ? "portfolio_fall" : "portfolio");
        data.put("ticker", "");
        data.put("title", falling ? "Portföy düşüşü" : "Portföy yükselişi");
        data.put("body", falling
                ? "Toplam portföy bugün -%" + formatLevel(Math.abs(level)) + " seviyesine düştü."
                : "Toplam portföy bugün +%" + formatLevel(level) + " seviyesini geçti.");
        return NotificationHelper.show(context, data);
    }

    private static String formatLevel(double value) {
        double rounded = Math.round(value * 2.0) / 2.0;
        if (Math.abs(rounded - Math.rint(rounded)) < 1e-9) return Long.toString(Math.round(rounded));
        return String.format(Locale.US, "%.1f", rounded);
    }

    private static JSONObject readState(SharedPreferences prefs, String day) {
        JSONObject parsed = parseObject(prefs.getString(STATE_KEY, ""));
        if (parsed != null && day.equals(parsed.optString("day", ""))) return parsed;
        JSONObject fresh = new JSONObject();
        try {
            fresh.put("day", day);
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

    private static JSONObject parseObject(String raw) {
        try {
            if (raw == null || raw.trim().isEmpty()) return null;
            return new JSONObject(raw);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String normalizeTicker(String value) {
        return String.valueOf(value == null ? "" : value).trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }

    private static Quote fetchQuote(String ticker) throws Exception {
        String urlText = "https://query1.finance.yahoo.com/v8/finance/chart/" + ticker
                + ".IS?range=5d&interval=5m&includePrePost=false&events=div%2Csplits";
        URL url = NativeHttpPolicy.requireAllowed(urlText);
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setRequestMethod("GET");
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36");
            connection.setRequestProperty("Accept", "application/json,text/plain,*/*");
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new BackgroundRetryPolicy.HttpStatusException(status);
            return parseQuote(readUtf8(connection.getInputStream(), MAX_RESPONSE_BYTES));
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static Quote parseQuote(String body) throws Exception {
        JSONObject root = new JSONObject(body);
        JSONObject chart = root.optJSONObject("chart");
        JSONArray results = chart == null ? null : chart.optJSONArray("result");
        JSONObject result = results == null ? null : results.optJSONObject(0);
        if (result == null) throw new IllegalStateException("Fiyat verisi bulunamadı.");

        JSONObject meta = result.optJSONObject("meta");
        if (meta == null) meta = new JSONObject();
        double current = finite(meta.optDouble("regularMarketPrice", Double.NaN));
        long metaEpoch = meta.optLong("regularMarketTime", 0L);

        JSONArray timestamps = result.optJSONArray("timestamp");
        JSONObject indicators = result.optJSONObject("indicators");
        JSONArray quoteArray = indicators == null ? null : indicators.optJSONArray("quote");
        JSONObject quoteObject = quoteArray == null ? null : quoteArray.optJSONObject(0);
        JSONArray closes = quoteObject == null ? null : quoteObject.optJSONArray("close");

        long latestEpoch = 0L;
        double latestClose = Double.NaN;
        if (timestamps != null && closes != null) {
            int count = Math.min(timestamps.length(), closes.length());
            for (int i = 0; i < count; i++) {
                long epoch = timestamps.optLong(i, 0L);
                double close = finite(closes.optDouble(i, Double.NaN));
                if (epoch <= 0 || !Double.isFinite(close)) continue;
                if (epoch > latestEpoch) {
                    latestEpoch = epoch;
                    latestClose = close;
                }
            }
        }

        long effectiveEpoch = Math.max(metaEpoch, latestEpoch);
        if (latestEpoch > metaEpoch) current = latestClose;
        if (!Double.isFinite(current)) current = latestClose;
        if (effectiveEpoch <= 0 || !(current > 0)) throw new IllegalStateException("Eksik fiyat verisi.");

        LocalDate marketDay = Instant.ofEpochSecond(effectiveEpoch).atZone(ISTANBUL).toLocalDate();
        String previousSessionDate = null;
        LocalDate previous = null;
        Map<Long, Double> sessionCloses = new TreeMap<>();
        if (timestamps != null && closes != null) {
            int count = Math.min(timestamps.length(), closes.length());
            for (int i = 0; i < count; i++) {
                long epoch = timestamps.optLong(i, 0L);
                double close = finite(closes.optDouble(i, Double.NaN));
                if (epoch <= 0 || !Double.isFinite(close) || !(close > 0)) continue;
                LocalDate tickDay = Instant.ofEpochSecond(epoch).atZone(ISTANBUL).toLocalDate();
                if (tickDay.equals(marketDay)) {
                    sessionCloses.put(epoch, close);
                } else if (tickDay.isBefore(marketDay) && (previous == null || tickDay.isAfter(previous))) {
                    previous = tickDay;
                }
            }
        }
        if (previous != null) previousSessionDate = previous.toString();
        return new Quote(current, marketDay.toString(), previousSessionDate, sessionCloses);
    }

    private static double finite(double value) {
        return Double.isFinite(value) ? value : Double.NaN;
    }

    private static String readUtf8(InputStream input, int maxBytes) throws Exception {
        try (BufferedInputStream buffered = new BufferedInputStream(input);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
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
        final String marketDate;
        final String previousSessionDate;
        final Map<Long, Double> sessionCloses;

        Quote(double current, String marketDate, String previousSessionDate, Map<Long, Double> sessionCloses) {
            this.current = current;
            this.marketDate = marketDate;
            this.previousSessionDate = previousSessionDate;
            this.sessionCloses = sessionCloses;
        }
    }
}
