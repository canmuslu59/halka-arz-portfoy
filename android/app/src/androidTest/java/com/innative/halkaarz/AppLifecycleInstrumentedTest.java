package com.innative.halkaarz;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
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
import java.util.List;
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
