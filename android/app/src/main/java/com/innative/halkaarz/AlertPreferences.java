package com.innative.halkaarz;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.util.Map;

final class AlertPreferences {
    static final String PREFS = "halka_arz_portfoy";
    static final String PORTFOLIO_KEY = "portfolio_json_v1";
    static final String CONFIGURED_KEY = "alerts_configured_v1";
    static final String ENABLED_KEY = "alerts_enabled_v1";
    static final String THRESHOLD_KEY = "alert_threshold_pct_v1";
    static final String STATE_PREFIX = "alert_state_v1_";
    static final double DEFAULT_THRESHOLD = 3.0;

    private AlertPreferences() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isConfigured(Context context) {
        return prefs(context).getBoolean(CONFIGURED_KEY, false);
    }

    static boolean isEnabled(Context context) {
        SharedPreferences prefs = prefs(context);
        return prefs.getBoolean(CONFIGURED_KEY, false) && prefs.getBoolean(ENABLED_KEY, true);
    }

    static double threshold(Context context) {
        try {
            double value = Double.parseDouble(prefs(context).getString(THRESHOLD_KEY, String.valueOf(DEFAULT_THRESHOLD)));
            return value >= 0.1 && value <= 100.0 ? value : DEFAULT_THRESHOLD;
        } catch (Exception ignored) {
            return DEFAULT_THRESHOLD;
        }
    }

    static JSONObject readForWeb(Context context) {
        JSONObject result = new JSONObject();
        try {
            result.put("configured", isConfigured(context));
            result.put("enabled", prefs(context).getBoolean(ENABLED_KEY, true));
            result.put("threshold", threshold(context));
            result.put("notificationsAllowed", NotificationHelper.canNotify(context));
        } catch (Exception ignored) {}
        return result;
    }

    static boolean saveFromWeb(Context context, String json) {
        try {
            JSONObject value = new JSONObject(json);
            double threshold = value.optDouble("threshold", Double.NaN);
            if (!Double.isFinite(threshold) || threshold < 0.1 || threshold > 100.0) return false;
            prefs(context).edit()
                    .putBoolean(CONFIGURED_KEY, true)
                    .putBoolean(ENABLED_KEY, value.optBoolean("enabled", true))
                    .putString(THRESHOLD_KEY, Double.toString(threshold))
                    .commit();
            resetStates(context);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    static void resetStates(Context context) {
        SharedPreferences preferences = prefs(context);
        SharedPreferences.Editor editor = preferences.edit();
        for (Map.Entry<String, ?> entry : preferences.getAll().entrySet()) {
            if (entry.getKey().startsWith(STATE_PREFIX)) editor.remove(entry.getKey());
        }
        editor.apply();
    }
}
