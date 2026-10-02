package com.innative.halkaarz;

import android.Manifest;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebChromeClient;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.SystemBarStyle;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

public class MainActivity extends ComponentActivity {
    private static final String START_URL = "https://app.local/index.html";
    private static final String PREFS = "halka_arz_portfoy";
    private static final String PORTFOLIO_KEY = "portfolio_json_v1";
    private static final String BACKUP_KEY = "portfolio_json_v1_backup";
    private static final String NOTIFICATION_ASKED_KEY = "notification_permission_asked_v1";
    private static final String WALLET_WIDGET_PROMPTED_KEY = "wallet_widget_prompted_v1";
    private static final int MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
    private static final int MAX_BACKUP_BYTES = 5 * 1024 * 1024;
    private static final int MAX_REDIRECTS = 5;
    // Haberler ekranının ek RSS kaynakları yalnız WebView köprüsünde açılır;
    // arka plan bildirim işçisinin kullandığı NativeHttpPolicy listesi değişmez.
    private static final Set<String> NEWS_FEED_HOSTS = new HashSet<>(Arrays.asList(
            "www.trthaber.com",
            "www.cnnturk.com",
            "www.haberturk.com"
    ));
    private static final long EXIT_BACK_WINDOW_MS = 2000L;
    private final ExecutorService networkExecutor = new ThreadPoolExecutor(
            4,
            4,
            0L,
            TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(128),
            new ThreadPoolExecutor.AbortPolicy()
    );
    private final Runnable startupPermissionRequest = this::requestStartupNotificationPermission;
    private final Runnable startupWidgetPrompt = this::maybePromptWalletWidget;
    private final ActivityResultLauncher<String> notificationPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            granted -> handleNotificationPermissionResult()
    );
    private final ActivityResultLauncher<String> backupCreateLauncher = registerForActivityResult(
            new ActivityResultContracts.CreateDocument("application/json"),
            this::writePendingBackup
    );
    private final ActivityResultLauncher<String[]> backupOpenLauncher = registerForActivityResult(
            new ActivityResultContracts.OpenDocument(),
            this::readPickedBackup
    );
    private final OnBackPressedCallback backPressedCallback = new OnBackPressedCallback(true) {
        @Override
        public void handleOnBackPressed() {
            handleNativeBackPress();
        }
    };

    private WebView webView;
    private JSONObject pendingPushRoute;
    private int safeTopCssPx;
    private int safeBottomCssPx;
    private int safeLeftCssPx;
    private int safeRightCssPx;
    private int imeBottomCssPx;
    private long lastBackPressMs;
    private boolean walletWidgetPromoPending;
    private boolean lightThemeActive;
    private String pendingBackupJson;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(
                this,
                SystemBarStyle.dark(Color.TRANSPARENT),
                SystemBarStyle.dark(Color.TRANSPARENT)
        );
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, backPressedCallback);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 11, 21));
        applyInsets(webView);
        setSystemBarIcons(false);
        hideSystemNavigation();
        configureWebView(webView);
        setContentView(webView);
        capturePushRoute(getIntent());
        NotificationHelper.ensureChannels(this);
        BackgroundAlertScheduler.ensure(this);
        NewsTestScheduler.ensure(this);
        PushConfigSync.installId(this);
        PushMessagingService.refreshToken(this);
        webView.loadUrl(START_URL);
        webView.postDelayed(startupPermissionRequest, 700L);
        webView.postDelayed(startupWidgetPrompt, 2200L);
    }

    private void requestStartupNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(NOTIFICATION_ASKED_KEY, false)) return;
        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
    }


    private void maybePromptWalletWidget() {
        if (!"com.innative.halkaarz".equals(getPackageName()) || Build.VERSION.SDK_INT < 26 || isFinishing()) return;
        AppWidgetManager manager = AppWidgetManager.getInstance(this);
        if (!manager.isRequestPinAppWidgetSupported()) return;

        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(WALLET_WIDGET_PROMPTED_KEY, false)) return;
        prefs.edit().putBoolean(WALLET_WIDGET_PROMPTED_KEY, true).apply();
        walletWidgetPromoPending = true;
        deliverWalletWidgetPromo();
    }

    private void deliverWalletWidgetPromo() {
        if (!walletWidgetPromoPending || webView == null) return;
        String script = "Boolean(window.__showWalletWidgetPromo && (window.__showWalletWidgetPromo(), true))";
        evaluateJavascriptIfAlive(script, value -> {
            if ("true".equalsIgnoreCase(String.valueOf(value))) walletWidgetPromoPending = false;
        });
    }

    private void requestWalletWidgetPinNative() {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(this);
            ComponentName provider = new ComponentName(this, WalletWidgetProvider.class);
            if (!manager.requestPinAppWidget(provider, null, null)) {
                Toast.makeText(this, "Ana ekranınız doğrudan widget eklemeyi desteklemiyor.", Toast.LENGTH_LONG).show();
            }
        } catch (Exception ignored) {
            Toast.makeText(this, "Widget ekleme ekranı açılamadı.", Toast.LENGTH_LONG).show();
        }
    }

    private void applyInsets(WebView view) {
        ViewCompat.setOnApplyWindowInsetsListener(view, (target, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            float density = Math.max(1f, getResources().getDisplayMetrics().density);
            // EdgeToEdge.enable() makes Android 14 and older follow the same
            // layout model that Android 15+ enforces automatically. Always
            // consume the real system-bar/cutout insets so tappable WebView UI
            // never sits under status bars, navigation bars, or display cutouts.
            safeTopCssPx = Math.round(bars.top / density);
            safeBottomCssPx = Math.round(bars.bottom / density);
            safeLeftCssPx = Math.round(bars.left / density);
            safeRightCssPx = Math.round(bars.right / density);
            imeBottomCssPx = Math.round(ime.bottom / density);
            deliverSafeInsets();
            return insets;
        });
        ViewCompat.requestApplyInsets(view);
    }

    private void deliverSafeInsets() {
        if (webView == null) return;
        String script = "document.documentElement.style.setProperty('--android-safe-top','" + safeTopCssPx + "px');"
                + "document.documentElement.style.setProperty('--android-safe-bottom','" + safeBottomCssPx + "px');"
                + "document.documentElement.style.setProperty('--android-safe-left','" + safeLeftCssPx + "px');"
                + "document.documentElement.style.setProperty('--android-safe-right','" + safeRightCssPx + "px');"
                + "document.documentElement.style.setProperty('--android-ime-bottom','" + imeBottomCssPx + "px');";
        evaluateJavascriptIfAlive(script);
    }

    private void evaluateJavascriptIfAlive(String script, ValueCallback<String> callback) {
        WebView current = webView;
        if (current == null) return;
        current.post(() -> {
            if (webView != current || isFinishing() || isDestroyed()) return;
            current.evaluateJavascript(script, callback);
        });
    }

    private void evaluateJavascriptIfAlive(String script) {
        evaluateJavascriptIfAlive(script, null);
    }

    private void setSystemBarIcons(boolean lightTheme) {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(lightTheme);
        controller.setAppearanceLightNavigationBars(lightTheme);
    }

    private void hideSystemNavigation() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.navigationBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemNavigation();
    }

    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        view.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");
        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new LocalAssetClient(this) {
            @Override
            public void onPageFinished(WebView webView, String url) {
                super.onPageFinished(webView, url);
                deliverSafeInsets();
                deliverPendingPushRoute();
                deliverWalletWidgetPromo();
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemNavigation();
        NotificationHelper.ensureChannels(this);
        BackgroundAlertScheduler.ensure(this);
        NewsTestScheduler.ensure(this);
        if (webView != null) {
            evaluateJavascriptIfAlive("window.__notificationPermissionChanged && window.__notificationPermissionChanged();");
        }
    }

    @Override
    protected void onDestroy() {
        WebView currentWebView = webView;
        webView = null;
        networkExecutor.shutdownNow();
        if (currentWebView != null) {
            currentWebView.removeCallbacks(startupPermissionRequest);
            currentWebView.removeCallbacks(startupWidgetPrompt);
            currentWebView.removeJavascriptInterface("AndroidBridge");
            currentWebView.stopLoading();
            currentWebView.destroy();
        }
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        capturePushRoute(intent);
        deliverPendingPushRoute();
    }

    private void capturePushRoute(Intent intent) {
        if (intent == null || !intent.hasExtra("push_kind")) return;
        try {
            JSONObject route = new JSONObject();
            route.put("kind", intent.getStringExtra("push_kind"));
            route.put("ticker", intent.getStringExtra("push_ticker"));
            pendingPushRoute = route;
        } catch (Exception ignored) {}
    }

    private void deliverPendingPushRoute() {
        if (webView == null || pendingPushRoute == null) return;
        JSONObject route = pendingPushRoute;
        pendingPushRoute = null;
        evaluateJavascriptIfAlive("window.__handlePushRoute && window.__handlePushRoute(" + route.toString() + ");");
    }

    private void handleNativeBackPress() {
        if (webView != null) {
            webView.evaluateJavascript("Boolean(window.__handleAndroidBack && window.__handleAndroidBack())", value -> {
                if ("true".equalsIgnoreCase(String.valueOf(value))) {
                    lastBackPressMs = 0L;
                    return;
                }
                handleExitBackPress();
            });
            return;
        }
        handleExitBackPress();
    }

    private void handleExitBackPress() {
        long now = System.currentTimeMillis();
        if (now - lastBackPressMs <= EXIT_BACK_WINDOW_MS) {
            backPressedCallback.setEnabled(false);
            try {
                getOnBackPressedDispatcher().onBackPressed();
            } finally {
                backPressedCallback.setEnabled(true);
            }
            return;
        }
        lastBackPressMs = now;
        Toast.makeText(this, "Çıkmak için tekrar geri basın", Toast.LENGTH_SHORT).show();
    }

    private void handleNotificationPermissionResult() {
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(NOTIFICATION_ASKED_KEY, true).apply();
        if (webView != null) {
            evaluateJavascriptIfAlive("window.__notificationPermissionChanged && window.__notificationPermissionChanged();");
        }
        BackgroundAlertScheduler.ensure(this);
        NewsTestScheduler.ensure(this);
    }

    private void sharePortfolioCardImage(double leftPx, double topPx, double widthPx, double heightPx) {
        WebView currentWebView = webView;
        if (currentWebView == null) return;
        try {
            int viewWidth = currentWebView.getWidth();
            int viewHeight = currentWebView.getHeight();
            int left = Math.max(0, (int) Math.round(leftPx));
            int top = Math.max(0, (int) Math.round(topPx));
            int right = Math.min(viewWidth, left + Math.max(1, (int) Math.round(widthPx)));
            int bottom = Math.min(viewHeight, top + Math.max(1, (int) Math.round(heightPx)));
            if (viewWidth <= 0 || viewHeight <= 0 || right <= left || bottom <= top) {
                throw new IllegalStateException("Portföy kartı görünür değil.");
            }

            Bitmap fullBitmap = Bitmap.createBitmap(viewWidth, viewHeight, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(fullBitmap);
            currentWebView.draw(canvas);
            Bitmap cardBitmap = Bitmap.createBitmap(fullBitmap, left, top, right - left, bottom - top);
            fullBitmap.recycle();

            File shareDir = new File(getCacheDir(), "shared");
            if (!shareDir.exists() && !shareDir.mkdirs()) {
                cardBitmap.recycle();
                throw new IllegalStateException("Paylaşım klasörü oluşturulamadı.");
            }
            File imageFile = new File(shareDir, "portfolio-card.png");
            try (FileOutputStream output = new FileOutputStream(imageFile)) {
                if (!cardBitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
                    throw new IllegalStateException("Portföy kartı görseli oluşturulamadı.");
                }
            } finally {
                cardBitmap.recycle();
            }

            Uri imageUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", imageFile);
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("image/png");
            shareIntent.putExtra(Intent.EXTRA_STREAM, imageUri);
            shareIntent.setClipData(ClipData.newRawUri("Portföy kartı", imageUri));
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(shareIntent, "Portföy kartını paylaş"));
        } catch (Exception error) {
            Toast.makeText(this, "Portföy kartı paylaşımı açılamadı", Toast.LENGTH_SHORT).show();
        } finally {
            WebView latestWebView = webView;
            if (latestWebView != null) {
                latestWebView.post(() -> latestWebView.evaluateJavascript(
                        "window.__portfolioShareCaptureComplete && window.__portfolioShareCaptureComplete();", null));
            }
        }
    }

    private void openAppNotificationSettings() {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
        try {
            startActivity(intent);
        } catch (Exception ignored) {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
        }
    }

    private static boolean isAppLocal(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme()) && "app.local".equalsIgnoreCase(uri.getHost());
    }

    // Haber ve kaynak bağlantıları uygulama penceresinde değil, temaya uygun bir Custom Tab'de açılır.
    private void openExternalUri(Uri uri) {
        if (uri == null) return;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if ("mailto".equals(scheme) || "tel".equals(scheme)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
                Toast.makeText(this, "Bağlantı açılamadı.", Toast.LENGTH_SHORT).show();
            }
            return;
        }
        if (!"https".equals(scheme) && !"http".equals(scheme)) return;
        try {
            int toolbarColor = lightThemeActive ? Color.rgb(244, 247, 251) : Color.rgb(11, 16, 32);
            CustomTabColorSchemeParams colors = new CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(toolbarColor)
                    .build();
            new CustomTabsIntent.Builder()
                    .setDefaultColorSchemeParams(colors)
                    .setColorScheme(lightThemeActive ? CustomTabsIntent.COLOR_SCHEME_LIGHT : CustomTabsIntent.COLOR_SCHEME_DARK)
                    .setShowTitle(true)
                    .setShareState(CustomTabsIntent.SHARE_STATE_ON)
                    .setUrlBarHidingEnabled(true)
                    .build()
                    .launchUrl(this, uri);
        } catch (Exception customTabError) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
            } catch (Exception ignored) {
                Toast.makeText(this, "Bağlantıyı açacak tarayıcı bulunamadı.", Toast.LENGTH_SHORT).show();
            }
        }
    }

    // Yedekleme: kaydetme ve geri yükleme Android dosya seçicisiyle, paylaşma FileProvider ile yapılır.
    // Sonuçlar web katmanındaki window.__labsBackup* geri çağrılarına iletilir.
    private void notifyBackupResult(String callbackName, String payload) {
        evaluateJavascriptIfAlive("window." + callbackName + " && window." + callbackName + "("
                + JSONObject.quote(payload == null ? "" : payload) + ");");
    }

    private void startBackupSave(String json, String fileName) {
        pendingBackupJson = json;
        try {
            backupCreateLauncher.launch(safeBackupFileName(fileName));
        } catch (Exception error) {
            pendingBackupJson = null;
            notifyBackupResult("__labsBackupSaveFailed", "Dosya kaydetme ekranı açılamadı.");
        }
    }

    private void writePendingBackup(Uri uri) {
        String json = pendingBackupJson;
        pendingBackupJson = null;
        if (uri == null || json == null) {
            notifyBackupResult("__labsBackupSaveFailed", "");
            return;
        }
        try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new IllegalStateException("Dosya açılamadı.");
            output.write(json.getBytes(StandardCharsets.UTF_8));
            output.flush();
            notifyBackupResult("__labsBackupSaved", "");
        } catch (Exception error) {
            notifyBackupResult("__labsBackupSaveFailed", "Yedek dosyası yazılamadı.");
        }
    }

    private void startBackupPick() {
        try {
            backupOpenLauncher.launch(new String[] { "application/json", "text/plain", "application/octet-stream", "*/*" });
        } catch (Exception error) {
            notifyBackupResult("__labsBackupPickFailed", "Dosya seçme ekranı açılamadı.");
        }
    }

    private void readPickedBackup(Uri uri) {
        if (uri == null) {
            notifyBackupResult("__labsBackupPickFailed", "");
            return;
        }
        try {
            networkExecutor.execute(() -> {
                try (InputStream input = getContentResolver().openInputStream(uri)) {
                    if (input == null) throw new IllegalStateException("Dosya açılamadı.");
                    notifyBackupResult("__labsBackupPicked", readUtf8(input, MAX_BACKUP_BYTES));
                } catch (Exception error) {
                    notifyBackupResult("__labsBackupPickFailed", "Yedek dosyası okunamadı.");
                }
            });
        } catch (Exception error) {
            notifyBackupResult("__labsBackupPickFailed", "Yedek dosyası okunamadı.");
        }
    }

    private void shareBackupFile(String json, String fileName) {
        try {
            File backupDir = new File(getCacheDir(), "backups");
            if (!backupDir.exists() && !backupDir.mkdirs()) {
                throw new IllegalStateException("Yedek klasörü oluşturulamadı.");
            }
            File backupFile = new File(backupDir, safeBackupFileName(fileName));
            try (FileOutputStream output = new FileOutputStream(backupFile)) {
                output.write(json.getBytes(StandardCharsets.UTF_8));
            }
            Uri backupUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", backupFile);
            Intent shareIntent = new Intent(Intent.ACTION_SEND)
                    .setType("application/json")
                    .putExtra(Intent.EXTRA_STREAM, backupUri)
                    .putExtra(Intent.EXTRA_SUBJECT, "Portföy yedeği")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            shareIntent.setClipData(ClipData.newRawUri("Portföy yedeği", backupUri));
            startActivity(Intent.createChooser(shareIntent, "Portföy yedeğini paylaş"));
        } catch (Exception error) {
            Toast.makeText(this, "Yedek paylaşılamadı.", Toast.LENGTH_SHORT).show();
        }
    }

    private static String safeBackupFileName(String requested) {
        String name = requested == null ? "" : requested.trim().replaceAll("[^A-Za-z0-9._-]", "-");
        if (name.isEmpty()) name = "portfoy-yedek.json";
        if (!name.toLowerCase(Locale.ROOT).endsWith(".json")) name = name + ".json";
        if (name.length() > 80) name = name.substring(name.length() - 80);
        return name;
    }

    private class AndroidBridge {
        private final SharedPreferences prefs;
        private final MainActivity activity;

        AndroidBridge(MainActivity activity) {
            this.activity = activity;
            prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        }

        @JavascriptInterface
        public String readPortfolio() {
            String primary = prefs.getString(PORTFOLIO_KEY, "");
            if (isValidJsonObject(primary)) return primary;
            String backup = prefs.getString(BACKUP_KEY, "");
            return isValidJsonObject(backup) ? backup : "";
        }

        @JavascriptInterface
        public boolean writePortfolio(String json) {
            if (!isValidJsonObject(json)) return false;
            String current = prefs.getString(PORTFOLIO_KEY, "");
            SharedPreferences.Editor editor = prefs.edit();
            if (isValidJsonObject(current)) editor.putString(BACKUP_KEY, current);
            editor.putString(PORTFOLIO_KEY, json);
            return editor.commit();
        }

        @JavascriptInterface
        public void requestWalletWidgetPin() {
            activity.runOnUiThread(activity::requestWalletWidgetPinNative);
        }

        @JavascriptInterface
        public boolean updateWalletWidget(String json) {
            if (!isValidJsonObject(json)) return false;
            boolean saved = prefs.edit().putString(WalletWidgetProvider.SNAPSHOT_KEY, json).commit();
            if (saved) WalletWidgetProvider.updateAll(activity);
            return saved;
        }

        @JavascriptInterface
        public String getNotificationPermissionStatus() {
            if (Build.VERSION.SDK_INT < 33) return "not_required";
            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return "granted";
            return prefs.getBoolean(NOTIFICATION_ASKED_KEY, false) ? "denied" : "prompt";
        }

        @JavascriptInterface
        public String getNotificationStatus() {
            return NotificationHelper.diagnosticStatus(activity);
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            if (Build.VERSION.SDK_INT < 33) return;
            activity.runOnUiThread(() -> {
                if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                    BackgroundAlertScheduler.ensure(activity);
                    return;
                }
                boolean askedBefore = prefs.getBoolean(NOTIFICATION_ASKED_KEY, false);
                if (askedBefore && !activity.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
                    activity.openAppNotificationSettings();
                    return;
                }
                prefs.edit().putBoolean(NOTIFICATION_ASKED_KEY, true).apply();
                activity.notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
            });
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            activity.runOnUiThread(activity::openAppNotificationSettings);
        }

        @JavascriptInterface
        public void syncPushConfig(String json) {
            PushConfigSync.saveConfig(activity, json);
        }

        @JavascriptInterface
        public boolean showLocalNotification(String json) {
            try {
                JSONObject parsed = new JSONObject(json == null ? "{}" : json);
                Map<String, String> data = new HashMap<>();
                data.put("kind", parsed.optString("kind", "portfolio"));
                data.put("ticker", parsed.optString("ticker", ""));
                data.put("title", parsed.optString("title", "Halka Arz Portföyüm"));
                data.put("body", parsed.optString("body", "Portföyünüzde yeni bir hareket var."));
                return NotificationHelper.show(activity, data);
            } catch (Exception ignored) {
                return false;
            }
        }

        @JavascriptInterface
        public void shareCardImage(double leftPx, double topPx, double widthPx, double heightPx) {
            activity.runOnUiThread(() -> activity.sharePortfolioCardImage(leftPx, topPx, widthPx, heightPx));
        }

        @JavascriptInterface
        public void setSystemTheme(String theme) {
            boolean light = "light".equalsIgnoreCase(theme);
            activity.lightThemeActive = light;
            activity.runOnUiThread(() -> setSystemBarIcons(light));
        }

        // WebView prefers-color-scheme değerini uygulama temasından aldığı için "Sistem" teması
        // telefonun gerçek koyu/açık ayarını buradan okur.
        @JavascriptInterface
        public boolean isSystemDarkMode() {
            int nightMode = activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
            return nightMode == Configuration.UI_MODE_NIGHT_YES;
        }

        @JavascriptInterface
        public String getAppInfo() {
            try {
                JSONObject info = new JSONObject();
                info.put("packageName", activity.getPackageName());
                info.put("versionName", BuildConfig.VERSION_NAME);
                info.put("versionCode", BuildConfig.VERSION_CODE);
                return info.toString();
            } catch (Exception ignored) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void openExternalUrl(String urlText) {
            if (urlText == null) return;
            Uri uri = Uri.parse(urlText.trim());
            if (isAppLocal(uri)) return;
            activity.runOnUiThread(() -> activity.openExternalUri(uri));
        }

        @JavascriptInterface
        public boolean saveBackupFile(String json, String fileName) {
            if (!isValidJsonObject(json) || json.length() > MAX_BACKUP_BYTES) return false;
            activity.runOnUiThread(() -> activity.startBackupSave(json, fileName));
            return true;
        }

        @JavascriptInterface
        public boolean shareBackup(String json, String fileName) {
            if (!isValidJsonObject(json) || json.length() > MAX_BACKUP_BYTES) return false;
            activity.runOnUiThread(() -> activity.shareBackupFile(json, fileName));
            return true;
        }

        @JavascriptInterface
        public void pickBackupFile() {
            activity.runOnUiThread(activity::startBackupPick);
        }

        @JavascriptInterface
        public void httpGetAsync(String urlText, String requestId) {
            final String safeRequestId = requestId == null ? "" : requestId;
            try {
                networkExecutor.execute(() -> {
                    String envelope = performHttpGet(urlText);
                    if (webView == null) return;
                    String callback = "window.__nativeHttpResolve && window.__nativeHttpResolve("
                            + JSONObject.quote(safeRequestId) + "," + JSONObject.quote(envelope) + ");";
                    evaluateJavascriptIfAlive(callback);
                });
            } catch (Exception error) {
                if (webView == null) return;
                String message = error.getMessage() == null ? "Ağ isteği başlatılamadı." : error.getMessage();
                String callback = "window.__nativeHttpReject && window.__nativeHttpReject("
                        + JSONObject.quote(safeRequestId) + "," + JSONObject.quote(message) + ");";
                evaluateJavascriptIfAlive(callback);
            }
        }

    }

    private static String performHttpGet(String urlText) {
        JSONObject envelope = new JSONObject();
        HttpURLConnection connection = null;
        try {
            URL url = requireBridgeAllowed(urlText);
            int redirectCount = 0;
            while (true) {
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(12000);
                connection.setReadTimeout(12000);
                connection.setRequestMethod("GET");
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36");
                connection.setRequestProperty("Accept", "application/json,text/plain,text/html,*/*");
                connection.setRequestProperty("Accept-Language", "tr-TR,tr;q=0.9,en;q=0.8");
                int status = connection.getResponseCode();

                if (isRedirectStatus(status)) {
                    if (redirectCount >= MAX_REDIRECTS) throw new IllegalStateException("Çok fazla yönlendirme.");
                    String location = connection.getHeaderField("Location");
                    URL nextUrl = resolveBridgeRedirect(url, location);
                    connection.disconnect();
                    connection = null;
                    url = nextUrl;
                    redirectCount += 1;
                    continue;
                }

                InputStream stream = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
                String body = stream == null ? "" : readUtf8(stream, MAX_RESPONSE_BYTES);
                if (status < 200 || status >= 300) {
                    envelope.put("ok", false); envelope.put("status", status); envelope.put("error", "HTTP " + status);
                } else {
                    envelope.put("ok", true); envelope.put("status", status); envelope.put("body", body);
                }
                break;
            }
        } catch (Exception error) {
            try {
                envelope.put("ok", false); envelope.put("status", 0);
                envelope.put("error", error.getMessage() == null ? "Ağ isteği başarısız." : error.getMessage());
            } catch (Exception ignored) { return "{\"ok\":false,\"status\":0,\"error\":\"Ağ isteği başarısız.\"}"; }
        } finally {
            if (connection != null) connection.disconnect();
        }
        return envelope.toString();
    }

    private static boolean isNewsFeedHost(URL url) {
        return url != null
                && "https".equalsIgnoreCase(url.getProtocol())
                && url.getHost() != null
                && NEWS_FEED_HOSTS.contains(url.getHost().toLowerCase(Locale.ROOT));
    }

    private static URL requireBridgeAllowed(String urlText) throws Exception {
        URL url = new URL(urlText);
        return isNewsFeedHost(url) ? url : NativeHttpPolicy.requireAllowed(url);
    }

    private static URL resolveBridgeRedirect(URL current, String location) throws Exception {
        if (location != null && !location.trim().isEmpty()) {
            URL target = new URL(current, location.trim());
            if (isNewsFeedHost(target)) return target;
        }
        return NativeHttpPolicy.resolveRedirect(current, location);
    }

    private static boolean isRedirectStatus(int status) {
        return status == HttpURLConnection.HTTP_MOVED_PERM
                || status == HttpURLConnection.HTTP_MOVED_TEMP
                || status == HttpURLConnection.HTTP_SEE_OTHER
                || status == 307
                || status == 308;
    }

    private static class LocalAssetClient extends WebViewClient {
        private final Context context;
        LocalAssetClient(Context context) { this.context = context.getApplicationContext(); }
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !"app.local".equalsIgnoreCase(uri.getHost())) return super.shouldInterceptRequest(view, request);
            return openAsset(uri.getPath());
        }
        private WebResourceResponse openAsset(String requestPath) {
            String path = requestPath == null || requestPath.equals("/") ? "index.html" : requestPath.replaceFirst("^/", "");
            if (path.contains("..")) return null;
            try {
                InputStream input = context.getAssets().open("www/" + path);
                return new WebResourceResponse(mimeType(path), "UTF-8", input);
            } catch (Exception ignored) { return null; }
        }
        private static String mimeType(String path) {
            if (path.endsWith(".js")) return "application/javascript";
            if (path.endsWith(".css")) return "text/css";
            if (path.endsWith(".html")) return "text/html";
            if (path.endsWith(".json") || path.endsWith(".webmanifest")) return "application/json";
            if (path.endsWith(".svg")) return "image/svg+xml";
            String ext = MimeTypeMap.getFileExtensionFromUrl(path);
            String detected = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            return detected != null ? detected : "application/octet-stream";
        }
    }

    private static boolean isValidJsonObject(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        try { new JSONObject(value); return true; }
        catch (Exception ignored) { return false; }
    }

    private static String readUtf8(InputStream input, int maxBytes) throws Exception {
        try (BufferedInputStream buffered = new BufferedInputStream(input); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192]; int total = 0; int read;
            while ((read = buffered.read(chunk)) != -1) {
                total += read;
                if (total > maxBytes) throw new IllegalStateException("Yanıt çok büyük.");
                output.write(chunk, 0, read);
            }
            return output.toString("UTF-8");
        }
    }
}
