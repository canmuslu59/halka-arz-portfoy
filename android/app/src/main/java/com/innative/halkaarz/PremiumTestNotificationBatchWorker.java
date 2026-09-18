package com.innative.halkaarz;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public final class PremiumTestNotificationBatchWorker extends Worker {
    public PremiumTestNotificationBatchWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        if (!BuildConfig.APPLICATION_ID.endsWith(".premiumtest")) return Result.success();
        PremiumTestNotificationScheduler.scheduleBatchIfNeeded(getApplicationContext(), false);
        return Result.success();
    }
}
