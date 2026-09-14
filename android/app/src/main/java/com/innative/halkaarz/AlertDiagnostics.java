package com.innative.halkaarz;

import android.content.Context;
import org.json.JSONObject;

/** Bounded local diagnostics; never contains holdings or remote credentials. */
final class AlertDiagnostics {
    private static final String PREFS = "market_alert_diagnostics_v1";
    private AlertDiagnostics() {}

    static void record(Context context, String outcome, int valid, int expected, Double percent) {
        try {
            JSONObject data = new JSONObject();
            data.put("checkedAt", System.currentTimeMillis());
            data.put("outcome", outcome);
            data.put("validQuotes", valid);
            data.put("expectedQuotes", expected);
            if (percent != null && Double.isFinite(percent)) data.put("portfolioPct", percent);
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("last", data.toString()).apply();
        } catch (Exception ignored) {}
    }

    static JSONObject read(Context context) {
        try { return new JSONObject(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("last", "{}")); }
        catch (Exception ignored) { return new JSONObject(); }
    }
}
