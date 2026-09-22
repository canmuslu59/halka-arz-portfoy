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
    static final String DIAGNOSTIC_PREFS = "background_alert_scheduler_v3";
    static final String LAST_SCHEDULED_AT = "last_scheduled_at";
    static final String NEXT_CATCHUP_AT = "next_catchup_at";

    private static final String WORK_NAME = "background_market_alerts_v2";
    private static final String IMMEDIATE_WORK_NAME = "background_alert_immediate_v3";
    private static final String CATCHUP_WORK_NAME = "background_alert_catchup_v3";
    private static final long CATCHUP_DELAY_MINUTES = 15L;

    private BackgroundAlertScheduler() {}

    static void ensure(Context context) {
        Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PushConfigSync.PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(PushConfigSync.CONFIG_KEY, "");
        if (raw == null || raw.trim().isEmpty()) {
            // No holdings/config exist yet. Do not leave stale market work active.
            sync(app, false);
            return;
        }
        try {
            JSONObject config = new JSONObject(raw);
            sync(app, config.optBoolean("enabled", true) || config.optBoolean("ipoEnabled", true));
        } catch (Exception ignored) {
            sync(app, false);
        }
    }

    static void sync(Context context, boolean enabled) {
        Context app = context.getApplicationContext();
        WorkManager manager = WorkManager.getInstance(app);
        if (!enabled) {
            manager.cancelUniqueWork(WORK_NAME);
            manager.cancelUniqueWork(IMMEDIATE_WORK_NAME);
            manager.cancelUniqueWork(CATCHUP_WORK_NAME);
            return;
        }

        Constraints constraints = connectedConstraints();
        OneTimeWorkRequest immediate = new OneTimeWorkRequest.Builder(BackgroundAlertWorker.class)
                .setConstraints(constraints)
                .build();
        manager.enqueueUniqueWork(IMMEDIATE_WORK_NAME, ExistingWorkPolicy.REPLACE, immediate);

        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(
                BackgroundAlertWorker.class,
                15,
                TimeUnit.MINUTES
        ).setConstraints(constraints).build();
        manager.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, periodic);

        scheduleCatchUp(app);
        recordScheduled(app);
    }

    static void scheduleCatchUp(Context context) {
        Context app = context.getApplicationContext();
        WorkManager manager = WorkManager.getInstance(app);
        Constraints constraints = connectedConstraints();
        long delayMs = TimeUnit.MINUTES.toMillis(CATCHUP_DELAY_MINUTES);

        OneTimeWorkRequest catchup = new OneTimeWorkRequest.Builder(BackgroundAlertWorker.class)
                .setConstraints(constraints)
                .setInitialDelay(CATCHUP_DELAY_MINUTES, TimeUnit.MINUTES)
                .build();
        manager.enqueueUniqueWork(CATCHUP_WORK_NAME, ExistingWorkPolicy.REPLACE, catchup);

        app.getSharedPreferences(DIAGNOSTIC_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putLong(NEXT_CATCHUP_AT, System.currentTimeMillis() + delayMs)
                .apply();
    }

    private static Constraints connectedConstraints() {
        return new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
    }

    private static void recordScheduled(Context context) {
        context.getSharedPreferences(DIAGNOSTIC_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putLong(LAST_SCHEDULED_AT, System.currentTimeMillis())
                .apply();
    }
}
