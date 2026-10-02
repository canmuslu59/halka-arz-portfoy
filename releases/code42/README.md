# Hisse Portföyüm — Code42 / v2.5.8

Bu klasör, Code42 sürümünün kalıcı release kaydıdır.

## Kimlik

- Uygulama: Hisse Portföyüm
- Package: `com.innative.halkaarz`
- Version name: `2.5.8`
- Version code: `42`
- Branch: `release/v2.5.8-code42`
- Derleme: `.github/workflows/code42-final-play-aab.yml` (GitHub Windows sunucusu)

## İçerik

Code42 = Play'de aktif **Code41 / v2.5.7** (Last Known Good) + Labs uygulamasının (`com.innative.halkaarz.labs` 2.5.4-labs.2) özellikleri + açık mod düzeltmesi.

Labs'tan gelenler:

- Çok kaynaklı Haberler ekranı: Bloomberg HT, AA, TRT Haber, CNN Türk (Habertürk isteğe bağlı); arama, kategoriler, "Portföyüm" filtresi, kaydet/okundu, öne çıkanlar; haberler Custom Tab'de açılır.
- Cüzdan kartında "Tutarları gizle" düğmesi ve Ayarlar'da tutar gizliliği.
- Tema seçimi: Sistem / Açık / Koyu.
- Veri ve yedekleme: yedeği dosyaya kaydet, paylaş, yedekten geri yükle (Labs yedekleri de açılır), önbelleği temizle.
- Yeni Ayarlar düzeni ve bildirim durumu (Code41'in kendi tanılama verisiyle).
- Kapanan ekrana JavaScript gönderilmesini önleyen `evaluateJavascriptIfAlive` koruması (Firebase Test Lab dalı).

Bilerek alınmayanlar (bildirim mekanizması Code41'deki gibi kalsın diye):

- Labs'in haber bildirimi düzeni: son dakika / özet anahtarları, `getNewsNotificationPrefs`, `setNewsNotificationPrefs`, `setNewsSources`, LabsDigest/LabsNewsFeed/HeadlineEditor sınıfları ve Labs'in değiştirdiği NotificationHelper, PushConfigSync, NewsTestWorker, NewsNotificationFormatter, NewsTestScheduler, NewsTestPreviewWorker.
- Labs adı, LABS rozeti ve ayrı paket kimliği.

Düzeltme:

- Açık modda Performans ekranındaki "Toplam portföy" tutarı görünmüyordu (#d9ffff yazı / #f0fbfc zemin, kontrast 1.01:1). Özet değerleri ve grafik ipucu için açık mod renkleri eklendi (toplam #0b7480, 5.21:1).

## Bildirim mekanizması doğrulaması

- 26 bildirim dosyası (Java, web çekirdeği, bildirim sesleri, ağ güvenlik ayarı, strings.xml) Code41 ile bayt bayt aynı; `test/code42-labs-production.test.js` her derlemede kontrol eder.
- Derlenmiş AAB'de 33 bildirim sınıfının 31'i Code41 ile bayt kodu düzeyinde aynı; kalan 2 sınıftaki tek fark üretimde çalışmayan önizleme yolundaki sürüm numarası (37 → 42). Ayrıntı: `NOTIFICATION-BYTECODE.txt`.
- Push backend: `https://halka-arz-portfoy-push.grass-airboat.workers.dev` (derlenmiş BuildConfig'te doğrulandı), Firebase: production.
- Cloudflare Worker, D1 ve FCM tarafına dokunulmadı; deploy yapılmadı.

## Derleme ve doğrulama sonuçları

- CI run: `37042107933` — başarılı.
- Testler: 489/489 PASS.
- AAB içindeki 31 web dosyası commit ile bayt bayt aynı.
- İmzasız AAB: `Hisse-Portfoyum-v2.5.8-Code42-unsigned.aab`, SHA-256 `5f4f8aa4329e9d7c5499dad8ee21ff6b85dba921e46831ba0c09a0f92671391a` (`SHA256SUMS-UNSIGNED.txt`).

## İmza

- Play upload alias: `halkaarz-upload`
- Beklenen upload sertifikası SHA-256: `02:D9:F2:98:A5:6B:63:EC:90:67:B9:11:FC:89:89:07:B6:FD:FC:4E:05:91:43:D8:8F:0B:9D:F2:40:22:A2:72`
- Durum: imzalı AAB bu kayda eklendiğinde SHA-256 değeri `SHA256SUMS.txt` dosyasına yazılır.
- Signing key/keystore ve şifreler repoya eklenmez.

## Geri dönüş

Code42'de sorun olursa geri dönüş noktası Code41'dir: `safe/v2.5.7-code41-last-known-good` / tag `v2.5.7-code41`. Adımlar `SAFE_RELEASES.md` dosyasındadır. Code42, Play'de sorunsuz çalıştığı onaylanana kadar Last Known Good olarak işaretlenmez.
