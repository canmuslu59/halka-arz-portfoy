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

import java.time.Duration;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.concurrent.TimeUnit;

/**
 * Test-only news delivery fallback.
 *
 * Uses explicit 10:00 / 19:00 one-time work in addition to a 15-minute
 * catch-up periodic worker. This avoids anchoring digest delivery to the
 * arbitrary install/open time of PeriodicWorkRequest.
 */
final class NewsTestScheduler {
    static final String PREFS = "news_test_scheduler_v2";
    static final String LAST_RUN_AT = "last_run_at";
    static final String LAST_SUCCESS_AT = "last_success_at";
    static final String LAST_ERROR = "last_error";
    static final String LAST_ITEM_COUNT = "last_item_count";
    static final String LAST_DIGEST_SLOT = "last_digest_slot";
    static final String LAST_DIGEST_ATTEMPT_AT = "last_digest_attempt_at";
    static final String LAST_DIGEST_DELIVERED = "last_digest_delivered";
    static final String MORNING_TARGET_AT = "morning_target_at";
    static final String EVENING_TARGET_AT = "evening_target_at";

    private static final ZoneId ISTANBUL = ZoneId.of("Europe/Istanbul");
    private static final String IMMEDIATE_WORK = "news_test_immediate_v2";
    private static final String PERIODIC_WORK = "news_test_periodic_v1";
    private static final String MORNING_WORK = "news_test_morning_1000_v2";
    private static final String EVENING_WORK = "news_test_evening_1900_v2";
    private static final String PREVIEW_WORK_PREFIX = "news_test_preview_v1_";

    private NewsTestScheduler() {}

    static boolean enabled() {
        String appId = BuildConfig.APPLICATION_ID == null ? "" : BuildConfig.APPLICATION_ID;
        return BuildConfig.DEBUG && appId.endsWith(".graphtest");
    }

    static void ensure(Context context) {
        if (!enabled()) return;
        Context app = context.getApplicationContext();
        WorkManager manager = WorkManager.getInstance(app);
        Constraints constraints = connectedConstraints();

        // Every app open/resume gets an immediate catch-up check. Delivery
        // de-duplication prevents duplicate morning/evening notifications.
        manager.enqueueUniqueWork(
                IMMEDIATE_WORK,
                ExistingWorkPolicy.REPLACE,
                new OneTimeWorkRequest.Builder(NewsTestWorker.class)
                        .setConstraints(constraints)
                        .build()
        );

        manager.enqueueUniquePeriodicWork(
                PERIODIC_WORK,
                ExistingPeriodicWorkPolicy.UPDATE,
                new PeriodicWorkRequest.Builder(NewsTestWorker.class, 15, TimeUnit.MINUTES)
                        .setConstraints(constraints)
                        .build()
        );

        // Test-only visual regression preview. A version-specific unique name
        // makes it fire once after each new graph-test APK is installed/updated.
        manager.enqueueUniqueWork(
                PREVIEW_WORK_PREFIX + BuildConfig.VERSION_CODE,
                ExistingWorkPolicy.KEEP,
                new OneTimeWorkRequest.Builder(NewsTestPreviewWorker.class)
                        .setInitialDelay(8, TimeUnit.SECONDS)
                        .build()
        );

        scheduleDailyTargets(app);
    }

    static void scheduleDailyTargets(Context context) {
        if (!enabled()) return;
        Context app = context.getApplicationContext();
        WorkManager manager = WorkManager.getInstance(app);
        Constraints constraints = connectedConstraints();
        ZonedDateTime now = ZonedDateTime.now(ISTANBUL);

        long morningDelay = delayUntil(now, 10, 0);
        long eveningDelay = delayUntil(now, 19, 0);

        enqueueTarget(manager, constraints, MORNING_WORK, morningDelay);
        enqueueTarget(manager, constraints, EVENING_WORK, eveningDelay);

        long nowMs = System.currentTimeMillis();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit()
                .putLong(MORNING_TARGET_AT, nowMs + morningDelay)
                .putLong(EVENING_TARGET_AT, nowMs + eveningDelay)
                .apply();
    }

    private static Constraints connectedConstraints() {
        return new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
    }

    private static void enqueueTarget(
            WorkManager manager,
            Constraints constraints,
            String name,
            long delayMs
    ) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(NewsTestWorker.class)
                .setConstraints(constraints)
                .setInitialDelay(Math.max(0L, delayMs), TimeUnit.MILLISECONDS)
                .build();
        manager.enqueueUniqueWork(name, ExistingWorkPolicy.REPLACE, request);
    }

    static long delayUntil(ZonedDateTime now, int hour, int minute) {
        ZonedDateTime target = now.toLocalDate().atTime(hour, minute).atZone(ISTANBUL);
        if (!target.isAfter(now.plusSeconds(5))) target = target.plusDays(1);
        return Math.max(0L, Duration.between(now, target).toMillis());
    }
}
