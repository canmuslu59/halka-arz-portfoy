package com.innative.halkaarz;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class PushConfigSync {
    static final String PREFS = "halka_arz_portfoy";
    static final String INSTALL_ID_KEY = "push_install_id_v1";
    static final String TOKEN_KEY = "push_fcm_token_v1";
    static final String CONFIG_KEY = "push_config_v1";
    static final String MONITORING_SINCE_KEY = "push_monitoring_since_v1";
    static final String SYNCED_FINGERPRINT_KEY = "push_synced_fingerprint_v1";
    static final String LAST_SYNC_AT_KEY = "push_last_sync_at_v1";
    private static final long RESYNC_INTERVAL_MS = 60L * 60L * 1000L;
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
            safe.put("threshold", Math.max(1.0, Math.min(10.0, threshold)));
            safe.put("ipoEnabled", parsed.optBoolean("ipoEnabled", true));
            safe.put("marketReferenceProtocol", 2);
            org.json.JSONArray holdings = parsed.optJSONArray("holdings") == null ? new org.json.JSONArray() : parsed.optJSONArray("holdings");
            safe.put("holdings", holdings);

            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String nextConfig = safe.toString();
            String previousConfig = prefs.getString(CONFIG_KEY, "");
            if (nextConfig.equals(previousConfig)) {
                ensureSynced(context);
                return;
            }

            prefs.edit().putString(CONFIG_KEY, nextConfig).putLong(MONITORING_SINCE_KEY, System.currentTimeMillis()).apply();
            BackgroundAlertScheduler.sync(context, safe.optBoolean("enabled", true) || safe.optBoolean("ipoEnabled", true));
            ensureSynced(context);
        } catch (Exception ignored) {}
    }

    static void saveToken(Context context, String token) {
        if (token == null) return;
        String safeToken = token.trim();
        if (safeToken.isEmpty()) return;

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String previousToken = prefs.getString(TOKEN_KEY, "");
        if (safeToken.equals(previousToken)) {
            ensureSynced(context);
            return;
        }

        prefs.edit().putString(TOKEN_KEY, safeToken).apply();
        ensureSynced(context);
    }

    static void ensureSynced(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String token = prefs.getString(TOKEN_KEY, "");
        String config = prefs.getString(CONFIG_KEY, "");
        if (token == null || token.isEmpty() || config == null || config.isEmpty()) return;
        String fingerprint = registrationFingerprint(token, config);
        long lastSyncAt = prefs.getLong(LAST_SYNC_AT_KEY, 0L);
        boolean recentlySynced = System.currentTimeMillis() - lastSyncAt < RESYNC_INTERVAL_MS;
        if (fingerprint.equals(prefs.getString(SYNCED_FINGERPRINT_KEY, "")) && recentlySynced) return;
        syncAsync(context);
    }

    static String registrationFingerprint(String token, String config) {
        String source = String.valueOf(token) + "\n" + String.valueOf(config);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(source.getBytes("UTF-8"));
            StringBuilder result = new StringBuilder(bytes.length * 2);
            for (byte value : bytes) result.append(String.format("%02x", value & 0xff));
            return result.toString();
        } catch (Exception ignored) {
            return source;
        }
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
        String fingerprint = registrationFingerprint(token, config);
        HttpURLConnection connection = null;
        try {
            JSONObject configObject = new JSONObject(config);
            JSONObject remoteConfig = new JSONObject(configObject.toString());
            remoteConfig.put("trustedMarketEnabled", configObject.optBoolean("enabled", true));
            // Legacy production workers do not understand the verified-reference protocol.
            // Send enabled=false so they cannot emit stale Yahoo-based market alerts.
            // A protocol-aware worker restores the user's market setting from trustedMarketEnabled.
            remoteConfig.put("enabled", false);
            JSONObject body = new JSONObject();
            body.put("installId", installId(context));
            body.put("fcmToken", token);
            body.put("config", remoteConfig);
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
            int responseCode = connection.getResponseCode();
            if (responseCode >= 200 && responseCode < 300) {
                prefs.edit()
                        .putString(SYNCED_FINGERPRINT_KEY, fingerprint)
                        .putLong(LAST_SYNC_AT_KEY, System.currentTimeMillis())
                        .apply();
            }
        } catch (Exception ignored) {
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}