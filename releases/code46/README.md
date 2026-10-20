# Hisse Portföyüm — Code46 / v2.6.2

Bu klasör, Code46 sürümünün kalıcı release kaydıdır.

## Kimlik

- Uygulama: Hisse Portföyüm
- Package: `com.innative.halkaarz`
- Version name: `2.6.2`
- Version code: `46`
- Branch: `release/v2.6.2-code46`, derleme commit'i `c318f8bab1a19a5613d7558a170009488d476ae2` (tag `v2.6.2-code46`)
- Derleme: sahibinin bilgisayarında, `code43-final-play-aab.yml` korumalarının yerel karşılığıyla (JDK 17, Android SDK 36, Gradle 8.11.1)

## İçerik

Code46 = Code45 / v2.6.1 (açılış ekranı + temettü) + eski Android WebView desteği (`fix/webview-legacy-compat-20261020`).

- Chrome/WebView 92 altında (ör. güncellenmemiş Android 9) web katmanı hiç açılmıyordu (`?.`/`??` sözdizimi hatası). Bu WebView'lere aynı `app.local` adresleri `www/legacy/` altındaki esbuild (chrome64) dönüştürülmüş kopyalardan ve polyfill'lerden sunulur. Modern WebView'ler değişmeyen `www` dosyalarını yükler.
- Eski WebView'lere özel CSS düzeltmeleri: `max()/clamp()/env()` yerine yalnız `calc()/var()`; backdrop-filter olmayan WebView'lerde üst çubuk ve alt menü neredeyse opak (.99).
- `www` kaynakları, Code41 kilitli altı dosya dahil, bayt bayt aynı; `test/legacy-webview-compat.test.js` eski kopyaları kaynak blob'larına bağlar.

Ayrıntı: commit `d0854ec`, `f754710`, `cd57efa`, `09126b2`.

## Bildirim mekanizması

- Code41 bildirim kilidi bayt bayt aynı. Cloudflare tarafında değişiklik yok.

## Derleme, test ve imza

- Testler: 520/520 PASS.
- Firebase Test Lab (`ci/firebase-test-lab-webview-compat-20261020`): API 28 (WebView 66) / 33 / 36 eski WebView koşuları 1–4 başarılı (son koşu 39498894985, `09126b2`).
- AAB web paketi commit ile aynı: 60 dosya, 241 entry.
- İmzasız AAB SHA-256: `c1e183e9be2efc83f7d0cf1946b2dd10755a13ad6fde91b85e6c20af0d43171b`.
- Final Play AAB: `Hisse-Portfoyum-v2.6.2-Code46-Play.aab`, SHA-256 `c27aa6f06f99082949522cb51729c9380f22cbdb215be1657c1fdac3ea09a0c4`.
- İmza: `halkaarz-upload`, sertifika `02:D9:F2:98:A5:6B:63:EC:90:67:B9:11:FC:89:89:07:B6:FD:FC:4E:05:91:43:D8:8F:0B:9D:F2:40:22:A2:72`, SHA384withRSA, şifreyi sahibi kendi terminalinde girdi. `jar verified`, imzalı/imzasız içerik 241/241 aynı.

## Geri dönüş

- Geri dönüş noktası Code41 (`safe/v2.5.7-code41-last-known-good`); versionCode 47+ ile yeniden paketlenir (`SAFE_RELEASES.md`).
- Code46, Play'de sorunsuz çalıştığı onaylanana kadar Last Known Good olarak işaretlenmez.
