package com.innative.halkaarz;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Locale;

public final class AlertWorker extends Worker {
    private static final ZoneId ISTANBUL = ZoneId.of("Europe/Istanbul");
    private static final int MAX_RESPONSE_BYTES = 1024 * 1024;

    public AlertWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        if (!AlertPreferences.isEnabled(context) || !isMonitoringWindow(ZonedDateTime.now(ISTANBUL))) {
            return Result.success();
        }

        SharedPreferences preferences = AlertPreferences.prefs(context);
        String portfolioJson = preferences.getString(AlertPreferences.PORTFOLIO_KEY, "");
        if (portfolioJson == null || portfolioJson.trim().isEmpty()) return Result.success();

        try {
            JSONArray holdings = new JSONObject(portfolioJson).optJSONArray("holdings");
            if (holdings == null) return Result.success();
            double threshold = AlertPreferences.threshold(context);
            String today = LocalDate.now(ISTANBUL).toString();
            for (int index = 0; index < holdings.length(); index += 1) {
                JSONObject holding = holdings.optJSONObject(index);
                if (holding == null || holding.optDouble("currentLots", 0.0) <= 0.0) continue;
                String ticker = holding.optString("ticker", "").trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
                if (ticker.isEmpty()) continue;
                try {
                    Quote quote = fetchQuote(ticker);
                    if (!today.equals(quote.tradingDate) || !(quote.previousClose > 0.0)) continue;
                    double dailyPct = (quote.currentPrice - quote.previousClose) / quote.previousClose * 100.0;
                    AlertPolicy.Zone currentZone = AlertPolicy.classify(dailyPct, threshold);
                    AlertPolicy.Zone previousZone = readPreviousZone(preferences, ticker, quote.tradingDate);
                    if (AlertPolicy.shouldNotify(previousZone, currentZone)) {
                        NotificationHelper.showPriceAlert(context, ticker, quote.currentPrice, dailyPct, threshold);
                    }
                    preferences.edit().putString(AlertPreferences.STATE_PREFIX + ticker,
                            quote.tradingDate + "|" + currentZone.name()).apply();
                } catch (Exception ignored) {
                    // A single unavailable symbol must not stop the other portfolio alerts.
                }
            }
        } catch (Exception ignored) {
            // Corrupt local data is handled by the main app; background work exits quietly.
        }
        return Result.success();
    }

    private static boolean isMonitoringWindow(ZonedDateTime now) {
        DayOfWeek day = now.getDayOfWeek();
        if (day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY) return false;
        LocalTime time = now.toLocalTime();
        return !time.isBefore(LocalTime.of(9, 55)) && !time.isAfter(LocalTime.of(18, 15));
    }

    private static AlertPolicy.Zone readPreviousZone(SharedPreferences preferences, String ticker, String tradingDate) {
        String value = preferences.getString(AlertPreferences.STATE_PREFIX + ticker, "");
        if (value == null) return AlertPolicy.Zone.NEUTRAL;
        String[] parts = value.split("\\|", -1);
        if (parts.length != 2 || !tradingDate.equals(parts[0])) return AlertPolicy.Zone.NEUTRAL;
        try {
            return AlertPolicy.Zone.valueOf(parts[1]);
        } catch (Exception ignored) {
            return AlertPolicy.Zone.NEUTRAL;
        }
    }

    private static Quote fetchQuote(String ticker) throws Exception {
        String symbol = URLEncoder.encode(ticker + ".IS", "UTF-8");
        URL url = new URL("https://query1.finance.yahoo.com/v8/finance/chart/" + symbol
                + "?range=5d&interval=5m&includePrePost=false&events=div%2Csplits");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        try {
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36");
            connection.setRequestProperty("Accept", "application/json");
            if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) {
                throw new IllegalStateException("Piyasa verisi alınamadı.");
            }
            JSONObject chart = new JSONObject(readUtf8(connection.getInputStream())).getJSONObject("chart");
            JSONObject result = chart.getJSONArray("result").getJSONObject(0);
            JSONObject meta = result.getJSONObject("meta");
            double current = finite(meta.optDouble("regularMarketPrice", Double.NaN));
            double previousClose = finite(meta.optDouble("previousClose", Double.NaN));
            if (!Double.isFinite(previousClose)) previousClose = finite(meta.optDouble("chartPreviousClose", Double.NaN));
            if (!Double.isFinite(current)) current = latestClose(result);
            long marketEpoch = meta.optLong("regularMarketTime", 0L);
            if (!Double.isFinite(current) || !Double.isFinite(previousClose) || marketEpoch <= 0L) {
                throw new IllegalStateException("Piyasa verisi eksik.");
            }
            String tradingDate = Instant.ofEpochSecond(marketEpoch).atZone(ISTANBUL).toLocalDate().toString();
            return new Quote(current, previousClose, tradingDate);
        } finally {
            connection.disconnect();
        }
    }

    private static double latestClose(JSONObject result) {
        try {
            JSONArray closes = result.getJSONObject("indicators").getJSONArray("quote").getJSONObject(0).getJSONArray("close");
            for (int index = closes.length() - 1; index >= 0; index -= 1) {
                double value = closes.optDouble(index, Double.NaN);
                if (Double.isFinite(value)) return value;
            }
        } catch (Exception ignored) {}
        return Double.NaN;
    }

    private static double finite(double value) {
        return Double.isFinite(value) ? value : Double.NaN;
    }

    private static String readUtf8(InputStream input) throws Exception {
        try (BufferedInputStream buffered = new BufferedInputStream(input);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = buffered.read(buffer)) != -1) {
                total += read;
                if (total > MAX_RESPONSE_BYTES) throw new IllegalStateException("Piyasa yanıtı çok büyük.");
                output.write(buffer, 0, read);
            }
            return output.toString("UTF-8");
        }
    }

    private static final class Quote {
        final double currentPrice;
        final double previousClose;
        final String tradingDate;

        Quote(double currentPrice, double previousClose, String tradingDate) {
            this.currentPrice = currentPrice;
            this.previousClose = previousClose;
            this.tradingDate = tradingDate;
        }
    }
}
