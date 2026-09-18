package com.innative.halkaarz;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.TimeUnit;

final class PremiumTestNotificationScheduler {
    private static final String PERIODIC_WORK_NAME = "premium_test_fake_notification_batch_v1";
    private static final String SLOT_WORK_PREFIX = "premium_test_fake_notification_slot_v1_";
    private static final String PREFS = "premium_test_fake_notification_v1";
    private static final String LAST_BATCH_MS = "last_batch_ms";
    private static final long MIN_BATCH_GAP_MS = 59L * 60L * 1000L;
    private static final int NOTIFICATIONS_PER_BATCH = 4;
    private static final int MIN_DELAY_SECONDS = 3 * 60;
    private static final int MAX_DELAY_SECONDS = 57 * 60;

    private PremiumTestNotificationScheduler() {}

    static void ensure(Context context) {
        Context app = context.getApplicationContext();
        WorkManager manager = WorkManager.getInstance(app);

        if (!BuildConfig.APPLICATION_ID.endsWith(".premiumtest")) {
            manager.cancelUniqueWork(PERIODIC_WORK_NAME);
            return;
        }

        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(
                PremiumTestNotificationBatchWorker.class,
                1,
                TimeUnit.HOURS
        ).build();
        manager.enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                periodic
        );

        scheduleBatchIfNeeded(app, false);
    }

    static void scheduleBatchIfNeeded(Context context, boolean force) {
        if (!BuildConfig.APPLICATION_ID.endsWith(".premiumtest")) return;

        Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        long last = prefs.getLong(LAST_BATCH_MS, 0L);
        if (!force && last > 0L && now - last < MIN_BATCH_GAP_MS) return;

        prefs.edit().putLong(LAST_BATCH_MS, now).apply();

        List<Integer> delays = randomDistinctDelaysSeconds();
        WorkManager manager = WorkManager.getInstance(app);
        long batchId = now / 1000L;

        for (int i = 0; i < delays.size(); i++) {
            int slot = i + 1;
            Data input = new Data.Builder()
                    .putInt("slot", slot)
                    .putLong("batch_id", batchId)
                    .build();
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(PremiumTestNotificationWorker.class)
                    .setInputData(input)
                    .setInitialDelay(delays.get(i), TimeUnit.SECONDS)
                    .build();
            manager.enqueueUniqueWork(
                    SLOT_WORK_PREFIX + batchId + "_" + slot,
                    ExistingWorkPolicy.KEEP,
                    request
            );
        }
    }

    static List<Integer> randomDistinctDelaysSeconds() {
        Random random = new Random();
        Set<Integer> chosen = new HashSet<>();
        while (chosen.size() < NOTIFICATIONS_PER_BATCH) {
            int value = MIN_DELAY_SECONDS + random.nextInt(MAX_DELAY_SECONDS - MIN_DELAY_SECONDS + 1);
            chosen.add(value);
        }
        List<Integer> sorted = new ArrayList<>(chosen);
        Collections.sort(sorted);
        return sorted;
    }
}
