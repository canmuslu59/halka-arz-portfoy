package com.innative.halkaarz;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.NumberFormat;
import java.util.Locale;

public final class WalletWidgetProvider extends AppWidgetProvider {
    static final String SNAPSHOT_KEY = "wallet_widget_snapshot_v1";
    private static final String PREFS = "halka_arz_portfoy";
    private static final Locale TR = Locale.forLanguageTag("tr-TR");

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) manager.updateAppWidget(id, buildViews(context));
    }

    @Override
    public void onEnabled(Context context) {
        updateAll(context);
    }

    static void updateAll(Context context) {
        Context app = context.getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(app);
        ComponentName provider = new ComponentName(app, WalletWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(provider);
        if (ids == null || ids.length == 0) return;
        RemoteViews views = buildViews(app);
        manager.updateAppWidget(ids, views);
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.wallet_widget);
        JSONObject snapshot = readSnapshot(context);

        Double totalWealth = finite(snapshot, "totalWealth");
        Double totalProfit = finite(snapshot, "totalProfit");
        Double totalProfitPct = finite(snapshot, "totalProfitPct");
        Double dailyProfit = finite(snapshot, "dailyProfit");
        Double dailyPct = finite(snapshot, "dailyPct");
        Double invested = finite(snapshot, "invested");
        Double salesProceeds = finite(snapshot, "salesProceeds");

        views.setTextViewText(R.id.widget_total_wealth, money(totalWealth));
        views.setTextViewText(R.id.widget_daily, signedMoney(dailyProfit) + "  " + signedPct(dailyPct));
        views.setTextViewText(R.id.widget_total_profit, signedMoney(totalProfit) + "  " + signedPct(totalProfitPct));
        views.setTextViewText(R.id.widget_invested, money(invested));
        views.setTextViewText(R.id.widget_daily_pct, signedPct(dailyPct));
        views.setTextViewText(R.id.widget_cash, money(salesProceeds));

        int dailyColor = signColor(dailyProfit);
        int totalColor = signColor(totalProfit);
        views.setTextColor(R.id.widget_daily, dailyColor);
        views.setTextColor(R.id.widget_total_profit, totalColor);
        views.setTextColor(R.id.widget_daily_pct, signColor(dailyPct));

        Intent open = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                context,
                33033,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.wallet_widget_root, pending);
        return views;
    }

    private static JSONObject readSnapshot(Context context) {
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(SNAPSHOT_KEY, "");
        try {
            return raw == null || raw.trim().isEmpty() ? new JSONObject() : new JSONObject(raw);
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    private static Double finite(JSONObject object, String key) {
        if (object == null || !object.has(key) || object.isNull(key)) return null;
        double value = object.optDouble(key, Double.NaN);
        return Double.isFinite(value) ? value : null;
    }

    private static String money(Double value) {
        if (value == null) return "—";
        NumberFormat format = NumberFormat.getCurrencyInstance(TR);
        format.setMinimumFractionDigits(0);
        format.setMaximumFractionDigits(0);
        return format.format(value);
    }

    private static String signedMoney(Double value) {
        if (value == null) return "—";
        return (value > 0 ? "+" : "") + money(value);
    }

    private static String signedPct(Double value) {
        if (value == null) return "";
        NumberFormat format = NumberFormat.getNumberInstance(TR);
        format.setMinimumFractionDigits(1);
        format.setMaximumFractionDigits(1);
        return (value > 0 ? "+%" : value < 0 ? "-%" : "%")
                + format.format(Math.abs(value));
    }

    private static int signColor(Double value) {
        if (value == null || Math.abs(value) < 0.000001) return Color.rgb(190, 199, 219);
        return value > 0 ? Color.rgb(53, 212, 154) : Color.rgb(255, 117, 130);
    }
}
