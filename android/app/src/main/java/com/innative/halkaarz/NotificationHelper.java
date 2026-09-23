package com.innative.halkaarz;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.util.Map;

final class NotificationHelper {
    private static final String CHANNEL_MARKET = "market_moves_v2";
    private static final String CHANNEL_RISE = "market_rise_v1";
    private static final String CHANNEL_FALL = "portfolio_fall_v1";
    private static final String CHANNEL_CEILING = "market_ceiling_coin_v1";
    private static final String CHANNEL_FLOOR = "market_floor_v1";
    private static final String CHANNEL_IPO = "new_ipos";
    private static final String CHANNEL_NEWS_BREAKING = "news_breaking_v1";
    private static final String CHANNEL_NEWS_DIGEST = "news_digest_v1";

    private NotificationHelper() {}

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel market = new NotificationChannel(CHANNEL_MARKET, "Borsa hareketleri", NotificationManager.IMPORTANCE_HIGH);
        market.setDescription("Diğer borsa hareket bildirimleri");
        NotificationChannel rise = customSoundChannel(context, CHANNEL_RISE, "Portföy artışları", "Toplam portföy artış bildirimleri", com.innative.halkaarz.R.raw.notification_rise);
        NotificationChannel fall = customSoundChannel(context, CHANNEL_FALL, "Portföy düşüşleri", "Toplam portföy düşüş bildirimleri", com.innative.halkaarz.R.raw.notification_floor);
        NotificationChannel ceiling = customSoundChannel(context, CHANNEL_CEILING, "Tavan bildirimleri", "Tavan fiyatına ulaşan hisseler", com.innative.halkaarz.R.raw.notification_ceiling_coin);
        NotificationChannel floor = customSoundChannel(context, CHANNEL_FLOOR, "Taban bildirimleri", "Taban fiyatına ulaşan hisseler", com.innative.halkaarz.R.raw.notification_floor);
        NotificationChannel ipo = new NotificationChannel(CHANNEL_IPO, "Yeni halka arzlar", NotificationManager.IMPORTANCE_DEFAULT);
        ipo.setDescription("Yeni açıklanan halka arz bildirimleri");
        NotificationChannel newsBreaking = new NotificationChannel(CHANNEL_NEWS_BREAKING, "Son dakika haberleri", NotificationManager.IMPORTANCE_HIGH);
        newsBreaking.setDescription("5/5 önem derecesindeki kritik finans haberleri");
        NotificationChannel newsDigest = new NotificationChannel(CHANNEL_NEWS_DIGEST, "Haber özetleri", NotificationManager.IMPORTANCE_DEFAULT);
        newsDigest.setDescription("Günde iki kez öne çıkan finans haberleri özeti");
        manager.createNotificationChannel(market);
        manager.createNotificationChannel(rise);
        manager.createNotificationChannel(fall);
        manager.createNotificationChannel(ceiling);
        manager.createNotificationChannel(floor);
        manager.createNotificationChannel(ipo);
        manager.createNotificationChannel(newsBreaking);
        manager.createNotificationChannel(newsDigest);
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

    static String diagnosticStatus(Context context) {
        ensureChannels(context);
        try {
            JSONObject status = new JSONObject();
            boolean permissionGranted = Build.VERSION.SDK_INT < 33
                    || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
            boolean notificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled();
            status.put("permissionGranted", permissionGranted);
            status.put("notificationsEnabled", notificationsEnabled);
            status.put("sdk", Build.VERSION.SDK_INT);

            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
                JSONObject channels = new JSONObject();
                putChannelState(channels, manager, "market", CHANNEL_MARKET);
                putChannelState(channels, manager, "portfolio", CHANNEL_RISE);
                putChannelState(channels, manager, "portfolioFall", CHANNEL_FALL);
                putChannelState(channels, manager, "ceiling", CHANNEL_CEILING);
                putChannelState(channels, manager, "floor", CHANNEL_FLOOR);
                putChannelState(channels, manager, "ipo", CHANNEL_IPO);
                putChannelState(channels, manager, "newsBreaking", CHANNEL_NEWS_BREAKING);
                putChannelState(channels, manager, "newsDigest", CHANNEL_NEWS_DIGEST);
                status.put("channels", channels);
            }
            status.put("background", AlertDiagnostics.read(context));
            if (NewsTestScheduler.enabled()) {
                android.content.SharedPreferences newsTest = context.getSharedPreferences(NewsTestScheduler.PREFS, Context.MODE_PRIVATE);
                JSONObject news = new JSONObject();
                news.put("lastRunAt", newsTest.getLong(NewsTestScheduler.LAST_RUN_AT, 0L));
                news.put("lastSuccessAt", newsTest.getLong(NewsTestScheduler.LAST_SUCCESS_AT, 0L));
                news.put("lastError", newsTest.getString(NewsTestScheduler.LAST_ERROR, ""));
                news.put("verifiedItemCount", newsTest.getInt(NewsTestScheduler.LAST_ITEM_COUNT, 0));
                news.put("lastDigestSlot", newsTest.getString(NewsTestScheduler.LAST_DIGEST_SLOT, ""));
                news.put("lastDigestAttemptAt", newsTest.getLong(NewsTestScheduler.LAST_DIGEST_ATTEMPT_AT, 0L));
                news.put("lastDigestDelivered", newsTest.getBoolean(NewsTestScheduler.LAST_DIGEST_DELIVERED, false));
                news.put("nextMorningTargetAt", newsTest.getLong(NewsTestScheduler.MORNING_TARGET_AT, 0L));
                news.put("nextEveningTargetAt", newsTest.getLong(NewsTestScheduler.EVENING_TARGET_AT, 0L));
                status.put("newsTest", news);
            }
            return status.toString();
        } catch (Exception error) {
            return "{\"permissionGranted\":false,\"notificationsEnabled\":false,\"error\":\"diagnostic_failed\"}";
        }
    }

    private static void putChannelState(JSONObject channels, NotificationManager manager, String key, String channelId) throws Exception {
        NotificationChannel channel = manager.getNotificationChannel(channelId);
        JSONObject value = new JSONObject();
        value.put("exists", channel != null);
        int importance = channel == null ? NotificationManager.IMPORTANCE_NONE : channel.getImportance();
        value.put("importance", importance);
        value.put("enabled", channel != null && importance != NotificationManager.IMPORTANCE_NONE);
        channels.put(key, value);
    }

    static synchronized boolean show(Context context, Map<String, String> data) {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;

        ensureChannels(context);
        String kind = value(data, "kind", "portfolio");
        String ticker = value(data, "ticker", "");
        String newsId = value(data, "news_id", "");
        String digestSlot = value(data, "digest_slot", "");
        String digestDay = value(data, "digest_day", "");
        String title = value(data, "title", "Halka Arz Portföyüm");
        String body = value(data, "body", "Portföyünüzde yeni bir hareket var.");
        if ("news_digest".equals(kind)) {
            title = NewsNotificationFormatter.digestTitle(title, body);
            body = NewsNotificationFormatter.digestBody(body);
        }
        android.content.SharedPreferences delivered = context.getSharedPreferences("notification_delivery_v2", Context.MODE_PRIVATE);
        String day = java.time.LocalDate.now(java.time.ZoneId.of("Europe/Istanbul")).toString();
        String eventKey;
        if ("ipo".equals(kind)) eventKey = kind + ":" + ticker;
        else if ("news_breaking".equals(kind)) eventKey = kind + ":" + newsId;
        else if ("news_digest".equals(kind)) eventKey = kind + ":" + digestSlot + ":" + digestDay;
        else eventKey = kind + ":" + ticker + ":" + body.replace(',', '.');
        if (day.equals(delivered.getString("day", "")) && delivered.getBoolean(eventKey, false)) return true;

        String channel;
        if ("ipo".equals(kind)) channel = CHANNEL_IPO;
        else if ("news_breaking".equals(kind)) channel = CHANNEL_NEWS_BREAKING;
        else if ("news_digest".equals(kind)) channel = CHANNEL_NEWS_DIGEST;
        else if ("ceiling".equals(kind)) channel = CHANNEL_CEILING;
        else if ("floor".equals(kind)) channel = CHANNEL_FLOOR;
        else if ("portfolio_fall".equals(kind)) channel = CHANNEL_FALL;
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
        int requestCode = ("news_breaking".equals(kind) || "news_digest".equals(kind))
                ? eventKey.hashCode()
                : (kind + ":" + ticker + ":" + body).hashCode();
        PendingIntent pending = PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        int priority = "news_digest".equals(kind) ? NotificationCompat.PRIORITY_DEFAULT : NotificationCompat.PRIORITY_HIGH;
        CharSequence expandedBody = "news_digest".equals(kind)
                ? NewsNotificationFormatter.spacedDigestBody(body)
                : body;
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channel)
                .setSmallIcon(com.innative.halkaarz.R.drawable.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(expandedBody))
                .setAutoCancel(true)
                .setContentIntent(pending)
                .setPriority(priority);
        try {
            manager.notify(requestCode, builder.build());
            android.content.SharedPreferences.Editor delivery = delivered.edit();
            if (!day.equals(delivered.getString("day", ""))) delivery.clear();
            delivery.putString("day", day).putBoolean(eventKey, true).commit();
            return true;
        } catch (RuntimeException error) {
            return false;
        }
    }

    private static String value(Map<String, String> data, String key, String fallback) {
        String value = data == null ? null : data.get(key);
        return value == null || value.trim().isEmpty() ? fallback : value;
    }
}
