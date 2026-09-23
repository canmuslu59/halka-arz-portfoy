package com.innative.halkaarz;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.HashMap;
import java.util.Map;

public final class NewsTestPreviewWorker extends Worker {
    private static final String PREFS = "news_test_preview_v1";
    private static final String LAST_VERSION = "last_version";

    public NewsTestPreviewWorker(@NonNull Context appContext, @NonNull WorkerParameters params) {
        super(appContext, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        if (!NewsTestScheduler.previewEnabled()) return Result.success();

        Context app = getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int versionCode = BuildConfig.VERSION_CODE;
        if (prefs.getInt(LAST_VERSION, -1) == versionCode) return Result.success();

        Map<String, String> data = new HashMap<>();
        data.put("kind", "news_digest");
        data.put("digest_slot", "preview");
        data.put("digest_day", "preview-v" + versionCode);
        data.put("title", "🏦 Faiz ve Piyasa Gündemi");
        data.put("body",
                "• Finansal Hizmetler Güven Endeksi Eylül'de arttı Türkiye Cumhuriyet Merkez Bankası verileri açıklandı…\n\n"
                + "• Tasfiye edilen 131 fondaki yatırımcı sayısı açıklandı SPK, tasfiye edilen fonlara ilişkin verileri paylaştı…\n\n"
                + "• TCMB'den bir elektronik para kuruluşuna faaliyet izni iptali TCMB, Papara hakkında yeni kararını duyurdu…");

        if (!NotificationHelper.show(app, data)) return Result.retry();
        prefs.edit().putInt(LAST_VERSION, versionCode).apply();
        return Result.success();
    }
}
