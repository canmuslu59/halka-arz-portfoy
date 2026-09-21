package com.innative.halkaarz;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebChromeClient;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
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
    private static final int MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
    private static final int MAX_REDIRECTS = 5;
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
    private final ActivityResultLauncher<String> notificationPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            granted -> handleNotificationPermissionResult()
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, backPressedCallback);
        WindowCompat.enableEdgeToEdge(getWindow());
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
        PushConfigSync.installId(this);
        PushMessagingService.refreshToken(this);
        webView.loadUrl(START_URL);
        webView.postDelayed(startupPermissionRequest, 700L);
    }

    private void requestStartupNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(NOTIFICATION_ASKED_KEY, false)) return;
        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
    }

    private void applyInsets(WebView view) {
        ViewCompat.setOnApplyWindowInsetsListener(view, (target, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            float density = Math.max(1f, getResources().getDisplayMetrics().density);
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
        webView.post(() -> webView.evaluateJavascript(script, null));
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
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemNavigation();
        NotificationHelper.ensureChannels(this);
        BackgroundAlertScheduler.ensure(this);
        if (webView != null) {
            webView.post(() -> webView.evaluateJavascript("window.__notificationPermissionChanged && window.__notificationPermissionChanged();", null));
        }
    }

    @Override
    protected void onDestroy() {
        WebView currentWebView = webView;
        webView = null;
        networkExecutor.shutdownNow();
        if (currentWebView != null) {
            currentWebView.removeCallbacks(startupPermissionRequest);
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
        webView.post(() -> webView.evaluateJavascript("window.__handlePushRoute && window.__handlePushRoute(" + route.toString() + ");", null));
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
            webView.post(() -> webView.evaluateJavascript("window.__notificationPermissionChanged && window.__notificationPermissionChanged();", null));
        }
        BackgroundAlertScheduler.ensure(this);
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
        public void setSystemTheme(String theme) {
            activity.runOnUiThread(() -> setSystemBarIcons("light".equalsIgnoreCase(theme)));
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
                    webView.post(() -> webView.evaluateJavascript(callback, null));
                });
            } catch (Exception error) {
                if (webView == null) return;
                String message = error.getMessage() == null ? "Ağ isteği başlatılamadı." : error.getMessage();
                String callback = "window.__nativeHttpReject && window.__nativeHttpReject("
                        + JSONObject.quote(safeRequestId) + "," + JSONObject.quote(message) + ");";
                webView.post(() -> webView.evaluateJavascript(callback, null));
            }
        }

    }

    private static String performHttpGet(String urlText) {
        JSONObject envelope = new JSONObject();
        HttpURLConnection connection = null;
        try {
            URL url = NativeHttpPolicy.requireAllowed(urlText);
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
                    URL nextUrl = NativeHttpPolicy.resolveRedirect(url, location);
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
