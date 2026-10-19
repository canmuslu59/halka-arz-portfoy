package com.innative.halkaarz;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleCallback;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

// Code44 QA: açılış ekranı (soğuk açılış, arka plandan dönüş) ve temettü ekranları gerçek
// BIST verisiyle denenir. Ekran görüntüleri ve rapor Test Lab'de directoriesToPull ile alınır.
@RunWith(AndroidJUnit4.class)
public class Code44SplashDividendInstrumentedTest {
    private static final String TAG = "CODE44_QA";
    private static final String TEST_PACKAGE = "com.innative.halkaarz.test";
    private static final String PREFS = "halka_arz_portfoy";
    private static final String PORTFOLIO_KEY = "portfolio_json_v1";
    // ticker, lot, alış fiyatı, alış tarihi — temettü dağıtan, geçmişi uzun hisseler.
    private static final String[][] HOLDINGS = {
            {"TUPRS", "100", "90", "2023-01-03"},
            {"FROTO", "20", "700", "2023-01-03"},
            {"EREGL", "200", "35", "2023-01-03"},
            {"TTRAK", "20", "450", "2023-01-03"},
    };
    private static final JSONObject REPORT = new JSONObject();

    private Context target;
    private File outDir;

    @Before
    public void seedPortfolio() throws Exception {
        target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        if (Build.VERSION.SDK_INT >= 33) {
            try (ParcelFileDescriptor ignored = InstrumentationRegistry.getInstrumentation().getUiAutomation()
                    .executeShellCommand("pm grant " + TEST_PACKAGE + " " + Manifest.permission.POST_NOTIFICATIONS)) {
                // İzin diyaloğu ekran görüntülerine girmesin.
            } catch (Exception ignored) {}
        }
        JSONArray holdings = new JSONArray();
        for (String[] row : HOLDINGS) {
            JSONObject holding = new JSONObject();
            holding.put("id", "qa-" + row[0].toLowerCase());
            holding.put("ticker", row[0]);
            holding.put("initialLots", Integer.parseInt(row[1]));
            holding.put("currentLots", Integer.parseInt(row[1]));
            holding.put("addedAt", row[3] + "T09:00:00.000Z");
            holding.put("ipoPriceOverride", Double.parseDouble(row[2]));
            holding.put("firstTradeDateOverride", row[3]);
            holding.put("sectorOverride", JSONObject.NULL);
            holding.put("sales", new JSONArray());
            holdings.put(holding);
        }
        target.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .clear()
                .putString(PORTFOLIO_KEY, new JSONObject().put("holdings", holdings).toString())
                .putBoolean("notification_permission_asked_v1", true)
                .putBoolean("wallet_widget_prompted_v1", true)
                .commit();
        outDir = new File(target.getExternalFilesDir(null), "code44-qa");
        if (!outDir.exists()) outDir.mkdirs();
    }

    @Test
    public void coldStartKeepsSplashUntilPricesAreReadyAndDividendScreensRender() throws Exception {
        long startedAt = SystemClock.uptimeMillis();
        AtomicReference<Boolean> visibleAtResume = new AtomicReference<>(null);
        ActivityLifecycleCallback probe = splashProbe(visibleAtResume);
        ActivityLifecycleMonitorRegistry.getInstance().addLifecycleCallback(probe);
        ActivityScenario<MainActivity> launched;
        try {
            launched = ActivityScenario.launch(MainActivity.class);
        } finally {
            ActivityLifecycleMonitorRegistry.getInstance().removeLifecycleCallback(probe);
        }
        try (ActivityScenario<MainActivity> scenario = launched) {
            boolean visibleAtLaunch = Boolean.TRUE.equals(visibleAtResume.get());
            report("cold.launchReturnedMs", SystemClock.uptimeMillis() - startedAt);
            report("cold.splashVisibleAtLaunch", visibleAtLaunch);
            report("cold.splashVisibleWhenLaunchReturned", splashVisible(scenario));
            screenshot("01-cold-splash");
            SystemClock.sleep(1200L);
            screenshot("01b-cold-splash-1200ms");

            long hiddenAfter = waitSplashGone(scenario, startedAt, 15_000L);
            report("cold.splashHiddenAfterMs", hiddenAfter);
            SystemClock.sleep(450L);
            report("cold.homeAfterSplash", js(scenario,
                    "JSON.stringify({total:$t('#totalWealth'),profit:$t('#totalProfitBadge'),today:$t('#dailyProfit'),"
                            + "count:$t('#holdingCount'),compare:$t('#comparisonPortfolio')+' / '+$t('#comparisonBist'),"
                            + "dividendTotal:$t('#dividendHomeTotal'),dividendNote:$t('#dividendHomeNote'),market:$t('#marketStatus')})"));
            screenshot("02-home-after-splash");

            // Eski WebView (Chrome < 92) www/legacy kopyalarıyla açılmalı; hourCycle polyfill'i 24 saatlik kalmalı.
            String compat = js(scenario, "(()=>{const i=JSON.parse(window.AndroidBridge.getAppInfo());"
                    + "const h=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Istanbul',hour:'2-digit',hourCycle:'h23'}).format(new Date(Date.UTC(2026,9,20,11,30)));"
                    + "return JSON.stringify({webViewMajor:i.webViewMajor,legacyWebView:i.legacyWebView,istanbulHour:h,"
                    + "randomUUID:typeof crypto.randomUUID,fromEntries:typeof Object.fromEntries,userAgent:navigator.userAgent});})()");
            report("webview.compat", compat);
            JSONObject compatInfo = new JSONObject(compat);
            int webViewMajor = compatInfo.optInt("webViewMajor", -1);
            assertTrue("WebView sürümü okunamadı: " + compat, webViewMajor > 0);
            assertTrue("Legacy kipi WebView sürümüyle uyuşmuyor: " + compat, compatInfo.optBoolean("legacyWebView") == (webViewMajor < 92));
            assertTrue("İstanbul saati 24 saatlik değil: " + compat, "14".equals(compatInfo.optString("istanbulHour")));
            assertTrue("crypto.randomUUID yok: " + compat, "function".equals(compatInfo.optString("randomUUID")));

            report("cold.portfolioAfterSplash", portfolioDigest());
            boolean dividendsReady = waitForDividendSnapshots(40_000L);
            report("cold.dividendSnapshotsReady", dividendsReady);
            report("cold.portfolioAfterHistory", portfolioDigest());

            js(scenario, "document.querySelector('#dividendHomeCard').scrollIntoView({block:'center'});'ok'");
            SystemClock.sleep(500L);
            report("home.dividendCard", js(scenario, "$t('#dividendHomeCard')"));
            screenshot("03-home-dividend-card");

            js(scenario, "(()=>{document.querySelector('#dividendHomeOpen').click();window.scrollTo(0,0);return location.hash;})()");
            SystemClock.sleep(1500L);
            String dividendsVisible = js(scenario, "String(!document.querySelector('#dividendsView').hidden && document.querySelector('#portfolioView').hidden)");
            report("dividends.viewVisible", dividendsVisible);
            screenshot("04-dividends-hero");
            js(scenario, "document.querySelector('#dividendHoldings').scrollIntoView({block:'start'});window.scrollBy(0,-90);'ok'");
            SystemClock.sleep(400L);
            screenshot("05-dividends-holdings");
            js(scenario, "document.querySelector('#dividendPayments').scrollIntoView({block:'start'});window.scrollBy(0,-90);'ok'");
            SystemClock.sleep(400L);
            screenshot("06-dividends-payments");
            String dividendsText = js(scenario, "$t('#dividendsView')");
            report("dividends.viewText", dividendsText);
            assertTrue("Temettü ekranı boş", dividendsText != null && dividendsText.contains("Temettü Gelirim"));
            assertTrue("Temettü ekranı açılmadı", "true".equals(dividendsVisible));

            String opened = js(scenario, "(()=>{const b=document.querySelector('[data-dividend-holding]');if(!b)return 'none';b.click();return b.dataset.dividendHolding;})()");
            report("detail.openedHolding", opened);
            SystemClock.sleep(900L);
            js(scenario, "(()=>{const d=document.querySelector('.dividend-detail');if(d)d.scrollIntoView({block:'center'});return 'ok';})()");
            SystemClock.sleep(500L);
            screenshot("07-detail-dividends");
            report("detail.dividendText", js(scenario, "$t('.dividend-detail')"));

            assertTrue("Açılış ekranı ilk karede görünmedi", visibleAtLaunch);
            assertTrue("Açılış ekranı zamanında kalkmadı: " + hiddenAfter, hiddenAfter > 0 && hiddenAfter <= 11_500L);
        }
    }

    @Test
    public void resumeShowsSplashOnlyAfterLongBackgroundOnPriceScreens() throws Exception {
        long startedAt = SystemClock.uptimeMillis();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            report("resume.coldHiddenAfterMs", waitSplashGone(scenario, startedAt, 15_000L));
            SystemClock.sleep(600L);

            scenario.moveToState(Lifecycle.State.CREATED);
            SystemClock.sleep(3_000L);
            boolean shortVisible = resumeAndProbe(scenario);
            report("resume.shortBackgroundSplashVisible", shortVisible);

            scenario.moveToState(Lifecycle.State.CREATED);
            SystemClock.sleep(31_500L);
            long resumedAt = SystemClock.uptimeMillis();
            boolean longVisible = resumeAndProbe(scenario);
            screenshot("08-resume-splash");
            long longHidden = waitSplashGone(scenario, resumedAt, 12_000L);
            report("resume.longBackgroundSplashVisible", longVisible);
            report("resume.longBackgroundHiddenAfterMs", longHidden);
            SystemClock.sleep(450L);
            screenshot("09-resume-home");

            js(scenario, "document.querySelector('#marketsTab').click();'ok'");
            SystemClock.sleep(800L);
            scenario.moveToState(Lifecycle.State.CREATED);
            SystemClock.sleep(31_500L);
            boolean newsVisible = resumeAndProbe(scenario);
            report("resume.newsLongBackgroundSplashVisible", newsVisible);
            screenshot("10-resume-news");

            assertFalse("Kısa arka plan dönüşünde açılış ekranı çıkmamalı", shortVisible);
            assertTrue("Uzun arka plan dönüşünde açılış ekranı çıkmalı", longVisible);
            assertTrue("Dönüş açılış ekranı zamanında kalkmadı: " + longHidden, longHidden > 0 && longHidden <= 9_000L);
            assertFalse("Haberler ekranında açılış ekranı çıkmamalı", newsVisible);
        }
    }

    // ----------------------------------------------------------------------------------------

    private boolean waitForDividendSnapshots(long timeoutMs) throws Exception {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            JSONArray holdings = readPortfolio().optJSONArray("holdings");
            boolean ready = holdings != null && holdings.length() == HOLDINGS.length;
            for (int i = 0; ready && i < holdings.length(); i++) {
                JSONObject snapshot = holdings.getJSONObject(i).optJSONObject("historySnapshot");
                ready = snapshot != null && snapshot.optJSONArray("dividends") != null;
            }
            if (ready) return true;
            SystemClock.sleep(500L);
        }
        return false;
    }

    private JSONObject readPortfolio() throws Exception {
        SharedPreferences prefs = target.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(PORTFOLIO_KEY, "");
        return raw == null || raw.isEmpty() ? new JSONObject() : new JSONObject(raw);
    }

    private JSONArray portfolioDigest() throws Exception {
        JSONArray out = new JSONArray();
        JSONArray holdings = readPortfolio().optJSONArray("holdings");
        for (int i = 0; holdings != null && i < holdings.length(); i++) {
            JSONObject raw = holdings.getJSONObject(i);
            JSONObject quote = raw.optJSONObject("quoteSnapshot");
            JSONObject history = raw.optJSONObject("historySnapshot");
            JSONObject item = new JSONObject();
            item.put("ticker", raw.optString("ticker"));
            item.put("current", quote == null ? JSONObject.NULL : quote.opt("current"));
            item.put("quoteFetchedAt", quote == null ? JSONObject.NULL : quote.opt("fetchedAt"));
            item.put("historyRows", history == null || history.optJSONArray("history") == null ? -1 : history.optJSONArray("history").length());
            item.put("dividends", history == null ? JSONObject.NULL : history.opt("dividends"));
            item.put("splits", history == null ? JSONObject.NULL : history.opt("splits"));
            out.put(item);
        }
        return out;
    }

    // Açılış katmanı, WebView ile aynı kök FrameLayout'taki WebView olmayan son çocuktur.
    // (Bazı Samsung sürümleri content altına ek görünüm eklediği için konumdan değil WebView'den bulunur.)
    private static View splashView(MainActivity activity) {
        WebView webView = findWebView(activity.getWindow().getDecorView());
        if (webView == null || !(webView.getParent() instanceof ViewGroup)) return null;
        ViewGroup group = (ViewGroup) webView.getParent();
        for (int i = group.getChildCount() - 1; i >= 0; i--) {
            View child = group.getChildAt(i);
            if (child != webView) return child;
        }
        return null;
    }

    // Aktivite RESUMED olduğu anda (ana thread'de, ilk karelerden önce) logo durumunu kaydeder.
    private static ActivityLifecycleCallback splashProbe(AtomicReference<Boolean> result) {
        return (activity, stage) -> {
            if (stage != Stage.RESUMED || !(activity instanceof MainActivity) || result.get() != null) return;
            View splash = splashView((MainActivity) activity);
            result.set(splash != null && splash.getVisibility() == View.VISIBLE && splash.getAlpha() > 0.5f);
        };
    }

    private static boolean resumeAndProbe(ActivityScenario<MainActivity> scenario) {
        AtomicReference<Boolean> visible = new AtomicReference<>(null);
        ActivityLifecycleCallback probe = splashProbe(visible);
        ActivityLifecycleMonitorRegistry.getInstance().addLifecycleCallback(probe);
        try {
            scenario.moveToState(Lifecycle.State.RESUMED);
        } finally {
            ActivityLifecycleMonitorRegistry.getInstance().removeLifecycleCallback(probe);
        }
        return Boolean.TRUE.equals(visible.get());
    }

    private static boolean splashVisible(ActivityScenario<MainActivity> scenario) {
        AtomicReference<Boolean> visible = new AtomicReference<>(false);
        scenario.onActivity(activity -> {
            View splash = splashView(activity);
            visible.set(splash != null && splash.getVisibility() == View.VISIBLE && splash.getAlpha() > 0.5f);
        });
        return Boolean.TRUE.equals(visible.get());
    }

    private static long waitSplashGone(ActivityScenario<MainActivity> scenario, long since, long timeoutMs) {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            AtomicReference<Boolean> gone = new AtomicReference<>(false);
            scenario.onActivity(activity -> {
                View splash = splashView(activity);
                gone.set(splash == null || splash.getVisibility() != View.VISIBLE || splash.getAlpha() < 0.5f);
            });
            if (Boolean.TRUE.equals(gone.get())) return SystemClock.uptimeMillis() - since;
            SystemClock.sleep(100L);
        }
        return -1L;
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

    // $t(selector): elemanın görünen metni (boşluklar sadeleştirilmiş, en fazla 4000 karakter).
    private static String js(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
        String script = "(()=>{const $t=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\\s+/g,' ').trim().slice(0,4000):null;};"
                + "try{return " + expression + ";}catch(e){return 'JS_ERROR '+e;}})()";
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        scenario.onActivity(activity -> {
            WebView webView = findWebView(activity.findViewById(android.R.id.content));
            if (webView == null) { latch.countDown(); return; }
            webView.evaluateJavascript(script, value -> { result.set(value); latch.countDown(); });
        });
        latch.await(10, TimeUnit.SECONDS);
        String raw = result.get();
        if (raw == null || "null".equals(raw)) return null;
        Object decoded = new JSONTokener(raw).nextValue();
        return decoded instanceof String ? (String) decoded : String.valueOf(decoded);
    }

    private void screenshot(String name) {
        try {
            Bitmap bitmap = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
            if (bitmap == null) { Log.w(TAG, "screenshot null " + name); return; }
            try (FileOutputStream output = new FileOutputStream(new File(outDir, name + ".png"))) {
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, output);
            }
            bitmap.recycle();
            Log.i(TAG, "screenshot " + name);
        } catch (Exception error) {
            Log.w(TAG, "screenshot failed " + name + ": " + error);
        }
    }

    private void report(String key, Object value) {
        try {
            synchronized (REPORT) {
                REPORT.put(key, value == null ? JSONObject.NULL : value);
                try (FileOutputStream output = new FileOutputStream(new File(outDir, "report.json"))) {
                    output.write(REPORT.toString(2).getBytes(StandardCharsets.UTF_8));
                }
            }
        } catch (Exception error) {
            Log.w(TAG, "report write failed: " + error);
        }
        String text = String.valueOf(value);
        for (int i = 0; i < text.length(); i += 3000) {
            Log.i(TAG, key + (i == 0 ? "=" : "+=") + text.substring(i, Math.min(text.length(), i + 3000)));
        }
    }
}
