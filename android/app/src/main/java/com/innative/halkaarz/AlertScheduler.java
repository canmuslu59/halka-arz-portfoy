package com.innative.halkaarz;

import android.content.Context;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

final class AlertScheduler {
    private static final String PERIODIC_NAME = "bist_daily_price_alerts_v1";
    private static final String IMMEDIATE_NAME = "bist_daily_price_alert_check_v1";

    private AlertScheduler() {}

    static void refresh(Context context, boolean runImmediately) {
        WorkManager manager = WorkManager.getInstance(context.getApplicationContext());
        if (!AlertPreferences.isEnabled(context)) {
            manager.cancelUniqueWork(PERIODIC_NAME);
            manager.cancelUniqueWork(IMMEDIATE_NAME);
            return;
        }

        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(AlertWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build();
        manager.enqueueUniquePeriodicWork(PERIODIC_NAME, ExistingPeriodicWorkPolicy.UPDATE, periodic);

        if (runImmediately) {
            OneTimeWorkRequest immediate = new OneTimeWorkRequest.Builder(AlertWorker.class)
                    .setConstraints(constraints)
                    .build();
            manager.enqueueUniqueWork(IMMEDIATE_NAME, ExistingWorkPolicy.REPLACE, immediate);
        }
    }
}
