package com.innative.halkaarz;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.ComponentCallbacks2;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class AppLifecycleInstrumentedTest {
    private static final String TEST_PACKAGE = "com.innative.halkaarz.test";
    private static final String LOCAL_URL_PREFIX = "https://app.local/";

    @Before
    public void preparePermissions() {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals(TEST_PACKAGE, target.getPackageName());

        if (Build.VERSION.SDK_INT >= 33) {
            try (ParcelFileDescriptor ignored =
                         InstrumentationRegistry.getInstrumentation()
                                 .getUiAutomation()
                                 .executeShellCommand("pm grant " + TEST_PACKAGE + " " + Manifest.permission.POST_NOTIFICATIONS)) {
                // Best effort: avoids the runtime permission dialog interfering with lifecycle checks.
            } catch (Exception ignored) {
                // Test assertions below do not depend on permission being granted.
            }
        }
    }

    @Test
    public void isolatedPackageLaunchesAndLoadsLocalWebApp() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            String url = waitForLocalWebUrl(scenario, 10_000L);
            assertNotNull("WebView did not expose a URL", url);
            assertTrue("Expected local packaged web app, got: " + url, url.startsWith(LOCAL_URL_PREFIX));
        }
    }

    @Test
    public void activitySurvivesBackgroundResumeAndRecreate() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(waitForLocalWebUrl(scenario, 10_000L).startsWith(LOCAL_URL_PREFIX));

            scenario.moveToState(Lifecycle.State.CREATED);
            SystemClock.sleep(750L);
            scenario.moveToState(Lifecycle.State.RESUMED);
            assertTrue(waitForLocalWebUrl(scenario, 10_000L).startsWith(LOCAL_URL_PREFIX));

            scenario.recreate();
            assertTrue(waitForLocalWebUrl(scenario, 10_000L).startsWith(LOCAL_URL_PREFIX));
        }
    }



    @Test
    public void activityRemainsUsableAfterCriticalTrimMemoryCallback() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(waitForLocalWebUrl(scenario, 10_000L).startsWith(LOCAL_URL_PREFIX));

            scenario.onActivity(activity ->
                    activity.onTrimMemory(ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL));
            SystemClock.sleep(500L);

            assertTrue("Web app did not remain usable after critical trim-memory callback",
                    waitForLocalWebUrl(scenario, 10_000L).startsWith(LOCAL_URL_PREFIX));
        }
    }

    @Test
    public void activitySurvivesLandscapeAndPortraitRotation() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(waitForLocalWebUrl(scenario, 10_000L).startsWith(LOCAL_URL_PREFIX));

            scenario.onActivity(activity ->
                    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
            assertTrue("Activity did not rotate to landscape",
                    waitForOrientation(scenario, Configuration.ORIENTATION_LANDSCAPE, 10_000L));
            assertTrue(waitForLocalWebUrl(scenario, 10_000L).startsWith(LOCAL_URL_PREFIX));

            scenario.onActivity(activity ->
                    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
            assertTrue("Activity did not rotate back to portrait",
                    waitForOrientation(scenario, Configuration.ORIENTATION_PORTRAIT, 10_000L));
            assertTrue(waitForLocalWebUrl(scenario, 10_000L).startsWith(LOCAL_URL_PREFIX));

            scenario.onActivity(activity ->
                    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED));
        }
    }

    @Test
    public void allCriticalNotificationChannelsExist() {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        NotificationHelper.ensureChannels(target);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = target.getSystemService(NotificationManager.class);
        assertNotNull(manager);

        List<String> required = Arrays.asList(
                "market_moves_v2",
                "market_rise_v1",
                "portfolio_fall_v1",
                "market_ceiling_coin_v1",
                "market_floor_v1",
                "new_ipos",
                "news_breaking_v1",
                "news_digest_v1"
        );

        for (String id : required) {
            NotificationChannel channel = manager.getNotificationChannel(id);
            assertNotNull("Missing notification channel: " + id, channel);
            assertTrue("Notification channel disabled: " + id,
                    channel.getImportance() != NotificationManager.IMPORTANCE_NONE);
        }
    }


    @Test
    public void criticalNotificationKindsPostToExpectedChannels() {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        NotificationManager manager = target.getSystemService(NotificationManager.class);
        assertNotNull(manager);
        NotificationHelper.ensureChannels(target);

        String[][] cases = new String[][] {
                {"market", "market_moves_v2"},
                {"portfolio", "market_rise_v1"},
                {"portfolio_fall", "portfolio_fall_v1"},
                {"ceiling", "market_ceiling_coin_v1"},
                {"floor", "market_floor_v1"},
                {"ipo", "new_ipos"},
                {"news_breaking", "news_breaking_v1"},
                {"news_digest", "news_digest_v1"}
        };

        for (String[] testCase : cases) {
            manager.cancelAll();
            target.getSharedPreferences("notification_delivery_v2", Context.MODE_PRIVATE)
                    .edit()
                    .clear()
                    .commit();

            String kind = testCase[0];
            String expectedChannel = testCase[1];
            String unique = String.valueOf(System.nanoTime());

            Map<String, String> data = new HashMap<>();
            data.put("kind", kind);
            data.put("ticker", "TEST");
            data.put("title", "CI " + kind);
            data.put("body", "news_digest".equals(kind)
                    ? "Faiz kararı açıklandı\nEnflasyon verileri yayımlandı"
                    : "CI notification " + kind + " " + unique);
            data.put("news_id", "ci-" + unique);
            data.put("digest_slot", "morning");
            data.put("digest_day", "2099-01-01");

            assertTrue("NotificationHelper.show returned false for " + kind,
                    NotificationHelper.show(target, data));

            SystemClock.sleep(150L);
            StatusBarNotification[] active = manager.getActiveNotifications();
            boolean found = false;
            for (StatusBarNotification item : active) {
                String channelId = item.getNotification().getChannelId();
                if (expectedChannel.equals(channelId)) {
                    found = true;
                    break;
                }
            }
            assertTrue("Expected active notification on channel " + expectedChannel + " for " + kind, found);
        }

        manager.cancelAll();
    }


    private static boolean waitForOrientation(
            ActivityScenario<MainActivity> scenario,
            int expectedOrientation,
            long timeoutMs) {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        AtomicReference<Integer> currentOrientation = new AtomicReference<>();

        while (SystemClock.uptimeMillis() < deadline) {
            scenario.onActivity(activity ->
                    currentOrientation.set(activity.getResources().getConfiguration().orientation));

            Integer value = currentOrientation.get();
            if (value != null && value == expectedOrientation) return true;
            SystemClock.sleep(250L);
        }
        return false;
    }

    private static String waitForLocalWebUrl(ActivityScenario<MainActivity> scenario, long timeoutMs) {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        AtomicReference<String> currentUrl = new AtomicReference<>();

        while (SystemClock.uptimeMillis() < deadline) {
            scenario.onActivity(activity -> {
                WebView webView = findWebView(activity.findViewById(android.R.id.content));
                currentUrl.set(webView == null ? null : webView.getUrl());
            });

            String value = currentUrl.get();
            if (value != null && value.startsWith(LOCAL_URL_PREFIX)) return value;
            SystemClock.sleep(250L);
        }
        return currentUrl.get();
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (!(view instanceof ViewGroup)) return null;

        ViewGroup group = (ViewGroup) view;
        for (int i = 0; i < group.getChildCount(); i++) {
            WebView found = findWebView(group.getChildAt(i));
            if (found != null) return found;
        }
        return null;
    }
}
