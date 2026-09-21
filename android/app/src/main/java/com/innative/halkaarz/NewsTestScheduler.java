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

/**
 * Test-only news delivery fallback.
 *
 * The isolated Cloudflare test worker deliberately has no production Firebase
 * service-account secret. This scheduler lets the graph/news test APK exercise
 * the actual Android notification presentation without touching production.
 */
final class NewsTestScheduler {
    private static final String IMMEDIATE_WORK = "news_test_immediate_v1";
    private static final String PERIODIC_WORK = "news_test_periodic_v1";

    private NewsTestScheduler() {}

    static boolean enabled() {
        String backend = BuildConfig.PUSH_BACKEND_URL == null ? "" : BuildConfig.PUSH_BACKEND_URL;
        return BuildConfig.DEBUG && backend.contains("halka-arz-portfoy-push-news-test");
    }

    static void ensure(Context context) {
        if (!enabled()) return;
        Context app = context.getApplicationContext();
        WorkManager manager = WorkManager.getInstance(app);
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        manager.enqueueUniqueWork(
                IMMEDIATE_WORK,
                ExistingWorkPolicy.KEEP,
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
    }
}
