package com.innative.halkaarz;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.webkit.WebSettings;
import android.webkit.WebView;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Eski Android WebView desteği. www kaynakları Chrome 92 gerektirir (crypto.randomUUID 92, ||= 85,
// ?. ve ?? 80, Object.fromEntries 73 ...). Daha eski WebView bu sözdizimini ayrıştıramaz ve uygulama
// boş açılır (Android 9 imajındaki WebView 66). Bu durumda aynı adresler assets/www/legacy altındaki
// dönüştürülmüş kopyalardan sunulur: scripts/build-legacy-webview.mjs (esbuild target chrome64 +
// legacy-polyfills.js). Kaynak dosyalar, Code41 bildirim kilidindekiler dahil, değişmez.
final class LegacyWebView {
    static final int MODERN_MIN_CHROME_MAJOR = 92;
    static final String ASSET_DIR = "www/legacy/";
    private static final Pattern CHROME_MAJOR = Pattern.compile("Chrome/(\\d+)\\.");
    private static volatile int chromeMajor;

    private LegacyWebView() {}

    static boolean useLegacyAssets(Context context) {
        int major = chromeMajor(context);
        return major > 0 && major < MODERN_MIN_CHROME_MAJOR;
    }

    // -1: sürüm okunamadı (güncel paket kullanılır). İlk çağrı ana thread'de, WebView kurulurken yapılır.
    static int chromeMajor(Context context) {
        int cached = chromeMajor;
        if (cached != 0) return cached;
        int detected = detect(context);
        chromeMajor = detected;
        return detected;
    }

    // Kullanıcı aracısı motorun gerçek Chromium sürümünü verir; sağlayıcı paketinin sürüm adı üreticiye
    // göre farklı biçimde olabildiği için yalnız yedek olarak okunur.
    private static int detect(Context context) {
        try {
            Matcher match = CHROME_MAJOR.matcher(String.valueOf(WebSettings.getDefaultUserAgent(context)));
            if (match.find()) return Integer.parseInt(match.group(1));
        } catch (Throwable ignored) {}
        try {
            PackageInfo provider = WebView.getCurrentWebViewPackage();
            Matcher match = Pattern.compile("^(\\d+)\\.").matcher(provider == null ? "" : String.valueOf(provider.versionName));
            if (match.find()) return Integer.parseInt(match.group(1));
        } catch (Throwable ignored) {}
        return -1;
    }
}
