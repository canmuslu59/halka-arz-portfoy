package com.innative.halkaarz;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.time.ZonedDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

public final class PremiumTestNotificationWorker extends Worker {
    public PremiumTestNotificationWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        if (!BuildConfig.APPLICATION_ID.endsWith(".premiumtest")) return Result.success();

        int slot = getInputData().getInt("slot", 0);
        long batchId = getInputData().getLong("batch_id", 0L);
        String time = ZonedDateTime.now(ZoneId.of("Europe/Istanbul"))
                .format(DateTimeFormatter.ofPattern("HH:mm:ss"));

        Map<String, String> data = new HashMap<>();
        data.put("kind", "test");
        data.put("ticker", "TEST");
        data.put("title", "TEST — Bildirim sistemi");
        data.put(
                "body",
                "Sahte Premium test bildirimi " + slot + "/4 • " + time + " • #" + batchId
        );

        return NotificationHelper.show(getApplicationContext(), data)
                ? Result.success()
                : Result.retry();
    }
}
