package com.innative.halkaarz;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class PushConfigSync {
    static final String PREFS = "halka_arz_portfoy";
    static final String INSTALL_ID_KEY = "push_install_id_v1";
    static final String TOKEN_KEY = "push_fcm_token_v1";
    static final String CONFIG_KEY = "push_config_v1";
    private static final ExecutorService SYNC_EXECUTOR = Executors.newSingleThreadExecutor(
            runnable -> new Thread(runnable, "push-config-sync")
    );

    private PushConfigSync() {}

    static String installId(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String value = prefs.getString(INSTALL_ID_KEY, "");
        if (value != null && !value.trim().isEmpty()) return value;
        value = UUID.randomUUID().toString();
        prefs.edit().putString(INSTALL_ID_KEY, value).apply();
        return value;
    }

    static void saveConfig(Context context, String json) {
        try {
            JSONObject parsed = new JSONObject(json == null ? "{}" : json);
            JSONObject safe = new JSONObject();
            safe.put("enabled", parsed.optBoolean("enabled", true));
            double threshold = parsed.optDouble("threshold", 3.0);
            double normalizedThreshold = Math.round(Math.max(1.0, Math.min(10.0, threshold)) * 2.0) / 2.0;
            safe.put("threshold", normalizedThreshold);
            safe.put("ipoEnabled", parsed.optBoolean("ipoEnabled", true));
            org.json.JSONArray holdings = parsed.optJSONArray("holdings") == null ? new org.json.JSONArray() : parsed.optJSONArray("holdings");
            safe.put("holdings", holdings);

            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String nextConfig = safe.toString();
            String previousConfig = prefs.getString(CONFIG_KEY, "");
            if (nextConfig.equals(previousConfig)) return;

            prefs.edit().putString(CONFIG_KEY, nextConfig).apply();
            BackgroundAlertScheduler.sync(context, safe.optBoolean("enabled", true) || safe.optBoolean("ipoEnabled", true));
            syncAsync(context);
        } catch (Exception ignored) {}
    }

    static void saveToken(Context context, String token) {
        if (token == null) return;
        String safeToken = token.trim();
        if (safeToken.isEmpty()) return;

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String previousToken = prefs.getString(TOKEN_KEY, "");
        if (safeToken.equals(previousToken)) return;

        prefs.edit().putString(TOKEN_KEY, safeToken).apply();
        syncAsync(context);
    }

    static void syncAsync(Context context) {
        Context app = context.getApplicationContext();
        SYNC_EXECUTOR.execute(() -> sync(app));
    }

    private static void sync(Context context) {
        String base = BuildConfig.PUSH_BACKEND_URL == null ? "" : BuildConfig.PUSH_BACKEND_URL.trim();
        if (base.isEmpty()) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String token = prefs.getString(TOKEN_KEY, "");
        String config = prefs.getString(CONFIG_KEY, "");
        if (token == null || token.isEmpty() || config == null || config.isEmpty()) return;
        HttpURLConnection connection = null;
        try {
            JSONObject configObject = new JSONObject(config);
            JSONObject body = new JSONObject();
            body.put("installId", installId(context));
            body.put("fcmToken", token);
            body.put("config", configObject);
            URL url = new URL(base.replaceAll("/+$", "") + "/v1/installations");
            if (!"https".equalsIgnoreCase(url.getProtocol())) return;
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] bytes = body.toString().getBytes("UTF-8");
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            connection.getResponseCode();
        } catch (Exception ignored) {
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
