package com.innative.halkaarz;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String START_URL = "https://app.local/index.html";
    private static final String PREFS = "halka_arz_portfoy";
    private static final String PORTFOLIO_KEY = "portfolio_json_v1";
    private static final String BACKUP_KEY = "portfolio_json_v1_backup";
    private static final String ASSET_VERSION_KEY = "web_asset_version";
    private static final int MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
    private static final long DOUBLE_BACK_MS = 2000L;

    private final ExecutorService networkExecutor = Executors.newFixedThreadPool(4);
    private WebView webView;
    private long lastBackPressAt = 0L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(7, 11, 21));
        getWindow().setNavigationBarColor(Color.rgb(7, 11, 21));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 11, 21));
        configureWebView(webView);
        SharedPreferences appPrefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int previousAssetVersion = appPrefs.getInt(ASSET_VERSION_KEY, -1);
        if (previousAssetVersion != BuildConfig.VERSION_CODE) {
            webView.clearCache(true);
            appPrefs.edit().putInt(ASSET_VERSION_KEY, BuildConfig.VERSION_CODE).apply();
        }
        setContentView(webView);
        webView.loadUrl(START_URL);
    }

    @Override
    protected void onDestroy() {
        networkExecutor.shutdownNow();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);

        view.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");
        view.setWebViewClient(new LocalAssetClient(this));
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            lastBackPressAt = 0L;
            webView.goBack();
            return;
        }
        long current = System.currentTimeMillis();
        if (current - lastBackPressAt <= DOUBLE_BACK_MS) {
            super.onBackPressed();
            return;
        }
        lastBackPressAt = current;
        if (webView != null) {
            webView.evaluateJavascript("window.__showBackExitHint && window.__showBackExitHint();", null);
        }
    }

    private void postNativeResolve(String requestId, String envelope) {
        if (webView == null) return;
        String script = "window.__nativeHttpResolve && window.__nativeHttpResolve(" +
                JSONObject.quote(requestId) + "," + JSONObject.quote(envelope) + ");";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void postNativeReject(String requestId, String message) {
        if (webView == null) return;
        String script = "window.__nativeHttpReject && window.__nativeHttpReject(" +
                JSONObject.quote(requestId) + "," + JSONObject.quote(message) + ");";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private static String performHttpGet(String urlText) throws Exception {
        JSONObject envelope = new JSONObject();
        HttpURLConnection connection = null;
        try {
            URL url = new URL(urlText);
            if (!"https".equalsIgnoreCase(url.getProtocol())) {
                throw new IllegalArgumentException("Yalnız HTTPS bağlantısına izin verilir.");
            }
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setRequestMethod("GET");
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36");
            connection.setRequestProperty("Accept", "application/json,text/plain,text/html,*/*");
            connection.setRequestProperty("Accept-Language", "tr-TR,tr;q=0.9,en;q=0.8");
            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
            String body = stream == null ? "" : readUtf8(stream, MAX_RESPONSE_BYTES);
            if (status < 200 || status >= 300) {
                envelope.put("ok", false);
                envelope.put("status", status);
                envelope.put("error", "HTTP " + status);
            } else {
                envelope.put("ok", true);
                envelope.put("status", status);
                envelope.put("body", body);
            }
            return envelope.toString();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static class LocalAssetClient extends WebViewClient {
        private final Context context;

        LocalAssetClient(Context context) {
            this.context = context.getApplicationContext();
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !"app.local".equalsIgnoreCase(uri.getHost())) {
                return super.shouldInterceptRequest(view, request);
            }
            return openAsset(uri.getPath());
        }

        private WebResourceResponse openAsset(String requestPath) {
            String path = requestPath == null || requestPath.equals("/") ? "index.html" : requestPath.replaceFirst("^/", "");
            if (path.contains("..")) return null;
            try {
                InputStream input = context.getAssets().open("www/" + path);
                WebResourceResponse response = new WebResourceResponse(mimeType(path), "UTF-8", input);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
                response.setResponseHeaders(headers);
                return response;
            } catch (Exception ignored) {
                return null;
            }
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

    private class AndroidBridge {
        private final SharedPreferences prefs;

        AndroidBridge(Context context) {
            prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        }

        @JavascriptInterface
        public String readPortfolio() {
            String primary = prefs.getString(PORTFOLIO_KEY, "");
            if (isValidJsonObject(primary)) return primary;
            String backup = prefs.getString(BACKUP_KEY, "");
            return isValidJsonObject(backup) ? backup : "";
        }

        @JavascriptInterface
        public void writePortfolio(String json) {
            if (!isValidJsonObject(json)) return;
            String current = prefs.getString(PORTFOLIO_KEY, "");
            SharedPreferences.Editor editor = prefs.edit();
            if (isValidJsonObject(current)) editor.putString(BACKUP_KEY, current);
            editor.putString(PORTFOLIO_KEY, json);
            editor.commit();
        }

        @JavascriptInterface
        public String httpGet(String urlText) {
            try {
                return performHttpGet(urlText);
            } catch (Exception error) {
                return errorEnvelope(error);
            }
        }

        @JavascriptInterface
        public void httpGetAsync(String urlText, String requestId) {
            networkExecutor.execute(() -> {
                try {
                    postNativeResolve(requestId, performHttpGet(urlText));
                } catch (Exception error) {
                    postNativeReject(requestId, error.getMessage() == null ? "Ağ isteği başarısız." : error.getMessage());
                }
            });
        }

        private String errorEnvelope(Exception error) {
            try {
                JSONObject envelope = new JSONObject();
                envelope.put("ok", false);
                envelope.put("status", 0);
                envelope.put("error", error.getMessage() == null ? "Ağ isteği başarısız." : error.getMessage());
                return envelope.toString();
            } catch (Exception ignored) {
                return "{\"ok\":false,\"status\":0,\"error\":\"Ağ isteği başarısız.\"}";
            }
        }

        private boolean isValidJsonObject(String value) {
            if (value == null || value.trim().isEmpty()) return false;
            try {
                new JSONObject(value);
                return true;
            } catch (Exception ignored) {
                return false;
            }
        }
    }

    private static String readUtf8(InputStream input, int maxBytes) throws Exception {
        try (BufferedInputStream buffered = new BufferedInputStream(input);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            int total = 0;
            int read;
            while ((read = buffered.read(chunk)) != -1) {
                total += read;
                if (total > maxBytes) throw new IllegalStateException("Yanıt çok büyük.");
                output.write(chunk, 0, read);
            }
            return output.toString("UTF-8");
        }
    }
}
