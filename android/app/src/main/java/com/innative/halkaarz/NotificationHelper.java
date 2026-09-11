package com.innative.halkaarz;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

final class NotificationHelper {
    private static final String CHANNEL_MARKET = "market_moves_v2";
    private static final String CHANNEL_RISE = "market_rise_v1";
    private static final String CHANNEL_CEILING = "market_ceiling_coin_v1";
    private static final String CHANNEL_FLOOR = "market_floor_v1";
    private static final String CHANNEL_IPO = "new_ipos";
    private static final String PREFS = "halka_arz_portfoy";
    private static final String DELIVERY_STATE_KEY = "notification_delivery_guard_v1";
    private static final String DELIVERY_DAY_KEY = DELIVERY_STATE_KEY + "_day";
    private static final Object DELIVERY_LOCK = new Object();

    private NotificationHelper() {}

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel market = new NotificationChannel(CHANNEL_MARKET, "Borsa hareketleri", NotificationManager.IMPORTANCE_HIGH);
        market.setDescription("Diğer borsa hareket bildirimleri");
        NotificationChannel rise = customSoundChannel(context, CHANNEL_RISE, "Portföy artışları", "Toplam portföy artış bildirimleri", com.innative.halkaarz.R.raw.notification_rise);
        NotificationChannel ceiling = customSoundChannel(context, CHANNEL_CEILING, "Tavan bildirimleri", "Tavan fiyatına ulaşan hisseler", com.innative.halkaarz.R.raw.notification_ceiling_coin);
        NotificationChannel floor = customSoundChannel(context, CHANNEL_FLOOR, "Taban bildirimleri", "Taban fiyatına ulaşan hisseler", com.innative.halkaarz.R.raw.notification_floor);
        NotificationChannel ipo = new NotificationChannel(CHANNEL_IPO, "Yeni halka arzlar", NotificationManager.IMPORTANCE_DEFAULT);
        ipo.setDescription("Yeni açıklanan halka arz bildirimleri");
        manager.createNotificationChannel(market);
        manager.createNotificationChannel(rise);
        manager.createNotificationChannel(ceiling);
        manager.createNotificationChannel(floor);
        manager.createNotificationChannel(ipo);
    }

    private static NotificationChannel customSoundChannel(Context context, String id, String name, String description, int soundRes) {
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(description);
        String entry = context.getResources().getResourceEntryName(soundRes);
        Uri sound = Uri.parse("android.resource://" + context.getPackageName() + "/raw/" + entry);
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        channel.setSound(sound, attrs);
        return channel;
    }

    static boolean show(Context context, Map<String, String> data) {
        String kind = value(data, "kind", "portfolio");
        String ticker = value(data, "ticker", "");
        String title = value(data, "title", "Halka Arz Portföyüm");
        String body = value(data, "body", "Portföyünüzde yeni bir hareket var.");
        String deliveryDay = LocalDate.now(ZoneId.of("Europe/Istanbul")).toString();
        String deliveryKey;
        if ("portfolio".equals(kind)) {
            deliveryKey = kind + "|" + value(data, "level", body);
        } else if ("ceiling".equals(kind) || "floor".equals(kind) || "ipo".equals(kind)) {
            deliveryKey = kind + "|" + ticker;
        } else {
            deliveryKey = kind + "|" + ticker + "|" + body;
        }

        // Foreground JS, WorkManager and FCM can observe the same event independently. Serialize
        // the final delivery boundary so the user receives one notification, while producers that
        // arrive later see an already-delivered event as a successful no-op and can converge state.
        synchronized (DELIVERY_LOCK) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            Set<String> delivered = readDelivered(prefs, deliveryDay);
            if (delivered.contains(deliveryKey)) return true;

            if (Build.VERSION.SDK_INT >= 33
                    && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
            if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;

            ensureChannels(context);
            String channel;
            if ("ipo".equals(kind)) channel = CHANNEL_IPO;
            else if ("ceiling".equals(kind)) channel = CHANNEL_CEILING;
            else if ("floor".equals(kind)) channel = CHANNEL_FLOOR;
            else if ("portfolio".equals(kind)) channel = CHANNEL_RISE;
            else channel = CHANNEL_MARKET;

            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel notificationChannel = manager.getNotificationChannel(channel);
                if (notificationChannel == null || notificationChannel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                    return false;
                }
            }

            Intent intent = new Intent(context, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    .putExtra("push_kind", kind)
                    .putExtra("push_ticker", ticker);
            int requestCode = deliveryKey.hashCode();
            PendingIntent pending = PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channel)
                    .setSmallIcon(com.innative.halkaarz.R.drawable.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setAutoCancel(true)
                    .setContentIntent(pending)
                    .setPriority(NotificationCompat.PRIORITY_HIGH);
            try {
                manager.notify(requestCode, builder.build());
                delivered.add(deliveryKey);
                prefs.edit()
                        .putString(DELIVERY_DAY_KEY, deliveryDay)
                        .putString(DELIVERY_STATE_KEY, toJsonArray(delivered).toString())
                        .commit();
                return true;
            } catch (RuntimeException error) {
                return false;
            }
        }
    }

    private static Set<String> readDelivered(SharedPreferences prefs, String day) {
        Set<String> delivered = new HashSet<>();
        if (!day.equals(prefs.getString(DELIVERY_DAY_KEY, ""))) return delivered;
        try {
            JSONArray array = new JSONArray(prefs.getString(DELIVERY_STATE_KEY, "[]"));
            for (int i = 0; i < array.length(); i++) {
                String value = array.optString(i, "").trim();
                if (!value.isEmpty()) delivered.add(value);
            }
        } catch (Exception ignored) {}
        return delivered;
    }

    private static JSONArray toJsonArray(Set<String> values) {
        JSONArray array = new JSONArray();
        for (String value : values) array.put(value);
        return array;
    }

    private static String value(Map<String, String> data, String key, String fallback) {
        String value = data == null ? null : data.get(key);
        return value == null || value.trim().isEmpty() ? fallback : value;
    }
}
