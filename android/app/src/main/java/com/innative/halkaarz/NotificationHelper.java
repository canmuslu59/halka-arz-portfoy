package com.innative.halkaarz;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.Locale;

final class NotificationHelper {
    private static final String CHANNEL_ID = "bist_price_alerts";

    private NotificationHelper() {}

    static boolean canNotify(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    static void showPriceAlert(Context context, String ticker, double currentPrice, double dailyPct, double threshold) {
        if (!canNotify(context)) return;
        ensureChannel(context);
        String direction = dailyPct >= 0 ? "artış" : "azalış";
        String title = String.format(Locale.forLanguageTag("tr-TR"), "%s günlük %%%.2f %s", ticker, Math.abs(dailyPct), direction);
        String body = String.format(Locale.forLanguageTag("tr-TR"), "Fiyat %.2f TL · Belirlediğiniz %%%.2f eşiği aşıldı.", currentPrice, threshold);
        NotificationManagerCompat.from(context).notify(notificationId(ticker), builder(context, title, body).build());
    }

    static void showTest(Context context) {
        if (!canNotify(context)) return;
        ensureChannel(context);
        NotificationManagerCompat.from(context).notify(90301,
                builder(context, "Test bildirimi başarılı", "Fiyat alarmı bildirimleri bu telefonda çalışıyor.").build());
    }

    private static NotificationCompat.Builder builder(Context context, String title, String body) {
        Intent openApp = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, openApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Hisse fiyat alarmları", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Belirlenen günlük yüzde değişim eşiğine ulaşan hisseler");
        manager.createNotificationChannel(channel);
    }

    private static int notificationId(String ticker) {
        return 1000 + Math.abs(ticker.hashCode() % 50000);
    }
}
