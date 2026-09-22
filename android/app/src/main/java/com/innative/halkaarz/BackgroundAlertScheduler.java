package com.innative.halkaarz;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

final class BackgroundAlertScheduler {
    private static final String WORK_NAME = "background_market_alerts_v2";
    private static final String IMMEDIATE_WORK_NAME = "background_alert_immediate_v2";

    private BackgroundAlertScheduler() {}

    static void ensure(Context context) {
        Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PushConfigSync.PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(PushConfigSync.CONFIG_KEY, "");
        if (raw == null || raw.trim().isEmpty()) { sync(app, false); return; }
        try {
            JSONObject config = new JSONObject(raw);
            sync(app, config.optBoolean("enabled", true) || config.optBoolean("ipoEnabled", true));
        } catch (Exception ignored) { sync(app, false); }
    }

    static void sync(Context context, boolean enabled) {
        Context app = context.getApplicationContext();
        WorkManager manager = WorkManager.getInstance(app);
        if (!enabled) {
            manager.cancelUniqueWork(WORK_NAME);
            manager.cancelUniqueWork(IMMEDIATE_WORK_NAME);
            return;
        }
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest immediate = new OneTimeWorkRequest.Builder(BackgroundAlertWorker.class).setConstraints(constraints).build();
        manager.enqueueUniqueWork(IMMEDIATE_WORK_NAME, ExistingWorkPolicy.REPLACE, immediate);
        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(BackgroundAlertWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(constraints).build();
        manager.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, periodic);
    }
}
