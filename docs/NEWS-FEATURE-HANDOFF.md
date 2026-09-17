# Finans Haberleri Özelliği — Test → Production Handoff

Bu dosya, test branch'inde geliştirilen Finans Haberleri özelliğinin ileride güncel production sürümünün üzerine güvenli biçimde taşınması için tutulur.

## Çalışma sınırı

- Test branch: `feature/test-liked-rollback-20260917`
- Bu çalışma sırasında `main` / production değiştirilmedi.
- Test uygulama paketi: `com.innative.halkaarz.test`
- Haberler geliştirmesi eski test tabanı üzerinde yapıldığı için branch'in tamamı production'a merge/cherry-pick edilmemelidir.
- Production'a geçişte güncel production commit'i yeni taban olarak alınmalı ve aşağıdaki Haberler parçaları özellik bazında taşınmalıdır.

## Görsel ve davranış hedefi

Alt menüdeki görünür `Piyasalar` sekmesi `Haberler` olarak gösterilir. Route adı uyumluluk için hâlâ `markets` kalır.

Haberler ekranı:

1. `Popüler Haberler` yatay kart alanı
2. `Son Haberler` kompakt dikey listesi
3. Yalnız finans kategorileri
4. Yorum ve son-dakika bildirim sistemi yok

Finans kategorileri:

- `borsa` → Borsa — mavi
- `sirketler` → Şirketler — turuncu
- `doviz` → Döviz — yeşil
- `altin` → Altın — amber/sarı
- `ekonomi` → Ekonomi — kırmızı/pembe
- `halka-arz` → Halka Arz — mor

Aynı renkli kategori chip sistemi hem Popüler Haberler hem Son Haberler kartlarında kullanılmalıdır. Açık tema için ayrı kontrast değerleri vardır.

## Responsive düzen

Haber kartları sabit tek telefon ölçüsüne bağlı değildir.

İlk görsel tur:
- Popüler kart genişliği `clamp(...)` ile ekran genişliğine uyarlanır.
- Popüler haber medya alanı `aspect-ratio: 16/9` kullanır.
- Son Haberler görsel/metin kolonları `clamp(...)` ile ölçeklenir.
- Küçük telefonlar için `max-width: 390px` düzeni vardır.
- Daha geniş ekranlar için `min-width: 600px` düzeni vardır.

### İkinci görsel tur — 2026-09-17

Kullanıcı cihaz ekranındaki gerçek görünüm üzerinden aşağıdaki ikinci tur uygulanmıştır:

- Haber listesinin son satırları floating dock altında kalmaması için Haberler görünümünde `--dock-height` ve `--android-safe-bottom` kullanan ek `padding-bottom` ve `scroll-padding-bottom` vardır.
- Ortadaki Cüzdan düğmesi artık **yalnız `active` iken mavi** görünür; Haberler gibi başka bir sekme seçiliyken nötrdür.
- Ortadaki Cüzdan ikonunun altında görünür `Cüzdan` etiketi vardır.
- Popüler kart genişliği yaklaşık `clamp(264px, 80vw, 330px)` aralığındadır ve kart metin alanı daraltılmıştır.
- Popüler haber başlığı maksimum **2 satırdır**; eski sabit/minimum yüksek başlık boşluğu kaldırılmıştır.
- Son Haberler thumbnail kolonu yaklaşık `clamp(58px, 17vw, 72px)` aralığına küçültülmüş ve satır padding'i sıkılaştırılmıştır.
- Amaç, aynı telefon ekranında daha fazla gerçek haber göstermek ve alt menü çakışmasını ortadan kaldırmaktır.

Ana uygulama/portföy hesaplama mantığı bu değişikliğin kapsamına dahil değildir.

## Haber zamanı kuralı

Haberlerde genel uygulama `timeAgo()` fonksiyonu kullanılmaz. Haberler için `formatFinanceNewsTime()` kullanılır ve `Europe/Istanbul` saat dilimi esas alınır.

Gösterim:

- 1 saatten yeni: `12 dk önce`
- Aynı gün: `3 saat önce`
- Bir önceki İstanbul takvim günü: `Dün 14:25`
- Daha eski: `16 Eyl • 10:40`
- Kaynak zamanı yok/parse edilemiyor: `Güncel`

Timezone bilgisi taşımayan haber zamanı İstanbul saati (`+03:00`) kabul edilir. Gelecekte görünen şüpheli saatlerde kullanıcıya uydurma relatif zaman gösterilmez.

### Bloomberg HT: kaynak-doğrulamalı başlık ve yayın zamanı

İkinci turdan itibaren Bloomberg HT öğelerinde worker yalnızca **haber keşfi / URL listesi** olarak kullanılır. Ekranda gösterilecek ilk görünür Bloomberg HT haberleri için uygulama orijinal Bloomberg HT makale sayfasını ayrıca açar.

Başlık için doğrulama sırası:

1. `meta[property="og:title"]`
2. `meta[name="twitter:title"]`
3. makaledeki `h1`

Yayın zamanı için doğrulama sırası:

1. `meta[property="article:published_time"]`
2. eşdeğer `article:published_time` meta alanı
3. `time[datetime]`
4. JSON-LD içindeki `datePublished`

Kurallar:

- Bloomberg HT için worker'ın `publishedAt` değeri ekranda gerçek zaman kabul edilmez.
- Orijinal makale sayfasından parse edilebilir yayın zamanı alınırsa bu kullanılır.
- Orijinal sayfada güvenilir yayın zamanı bulunamazsa `publishedAt: null` bırakılır ve UI `Güncel` yazar.
- Orijinal sayfadan gerçek başlık bulunursa worker başlığı yerine o kullanılır.
- `Hisse Senetleri`, `Borsa Kapanış`, `Cumhuriyet Altını`, `Ziynet Altını` gibi kategori/navigasyon başlıkları gerçek haber başlığı olarak gösterilmez.
- Orijinal makale doğrulanamıyor ve feed başlığı jenerik ise öğe görünür listeden çıkarılır; kullanıcıya sahte bir haber başlığı üretilmez.
- Metadata doğrulama penceresinin dışında kalan Bloomberg HT öğelerinde de worker'ın `publishedAt` değeri **açıkça `null` yapılır**. Böylece doğrulanmamış worker saati daha alt sıralardan görünür listeye taşınsa bile kullanıcıya gerçek yayın zamanı gibi gösterilemez; bu öğeler `Güncel` görünür.

Canlı CI probe'u (`.github/workflows/news-source-metadata-probe.yml`) orijinal Bloomberg HT sayfalarında gerçek başlık + parse edilebilir yayın zamanı bulunduğunu ayrıca doğrular. 2026-09-17 doğrulamasında orijinal sayfalardan örneğin `2026-09-17T18:55:25+03:00` biçiminde kaynak yayın zamanı başarıyla alınmıştır.

### AA fallback özel kuralı

AA Ekonomi liste fallback'i güvenilir yayın zamanını taşımıyorsa `publishedAt: null` bırakır. **`new Date().toISOString()` ile sahte yayın zamanı üretilmemelidir.** UI bu durumda `Güncel` yazar.

## Haber alma zinciri

Ana test feed'i:

`https://halka-arz-portfoy-news-test.grass-airboat.workers.dev/v1/news?limit=60`

İstemci fallback sırası:

1. Android native HTTP bridge üzerinden finans worker
2. Native istek başarısızsa WebView `fetch()` ile aynı worker
3. İkisi de başarısızsa `https://www.aa.com.tr/tr/ekonomi` doğrudan fallback

AA fallback yalnız ekonomi sayfasındaki `/tr/ekonomi/` haber bağlantılarını alır ve başlığa göre finans kategorisi tahmini yapar. Kaynak: `Anadolu Ajansı`.

Android native allow-list'te test worker hostu, AA hostları ve orijinal Bloomberg HT metadata doğrulaması için `bloomberght.com` / `www.bloomberght.com` bulunmalıdır.

## İlgili dosyalar

Feature/overlay:

- `scripts/apply-test-popular-finance-news.mjs` — Haberler görünümü, kategori chipleri, temel zaman formatter ve feed UI
- `scripts/apply-test-popular-finance-news-fallback.mjs` — worker/WebView/AA üç aşamalı fallback
- `scripts/apply-test-news-layout-polish-v2.mjs` — **en son çalışan izole post-overlay**; dock clearance, Cüzdan etiketi/aktif state, kompakt kartlar, jenerik başlık filtresi ve Bloomberg HT orijinal metadata doğrulaması
- `scripts/apply-test-portfolio-app-navigation.mjs` — overlay'leri sıralı olarak test build'ine uygular; `apply-test-news-layout-polish-v2.mjs` en son çalışmalıdır

Testler:

- `test/popular-finance-news-overlay.test.js`
- `test/news-layout-polish-v2.test.js`
- mevcut portföy / navigation / repeated-purchase regresyon testleri de build sırasında çalışır

Build / probe:

- `.github/workflows/popular-finance-news-test-apk.yml`
- `.github/workflows/news-android-ua-probe.yml` — ağ/fallback teşhisi
- `.github/workflows/news-source-metadata-probe.yml` — canlı orijinal Bloomberg HT sayfalarında gerçek başlık + yayın zamanı kontratı

## Önemli commitler

İlk görsel/zamanlama turu:

- `1c13e4cfa8dd1396aa904193cc5a746ccf2d6f9e` — zaman, kategori rengi ve responsive tasarım sözleşmelerini testle tanımlar
- `235ea71a5941d67f89821ab785a8ce0046b27912` — responsive tasarım, renkli kategoriler ve İstanbul-aware haber zamanını uygular
- `d6685caafac74baefa4dec1254a58a0602e546d7` — AA fallback'in sahte yayın zamanı üretmemesi için regresyon testi
- `ac4b467fcfc3f1aa203e94b56f1fb69fb14cdec6` — AA fallback'te bilinmeyen zamanı `null` bırakır

İkinci görsel/kaynak doğrulama turu:

- `b68f75060d7c3aa66e11f60fd1dd1a6b2d183b75` — kullanıcı ekranında görülen ikinci tur sorunlar için RED test sözleşmesi
- `3c2a7187ab16451dea931b97d59a80762e62a0e6` — izole v2 post-overlay: layout/nav + orijinal Bloomberg HT metadata doğrulaması
- `8a41bd2c76caf7372182bfa735945f2c0a8278b5` — v2 overlay'i fallback'lerden sonra çalıştıran wrapper sırası
- `72cd37321145ecd47326adc327adf69fc36273f9` — canlı orijinal haber metadata probe workflow'u
- `5e2a437417f6008f7780ccdb490ae281bbf5ac6c` — metadata penceresi dışındaki Bloomberg öğelerinin worker saatini korumamasını zorunlu kılan RED regresyon testi
- `b4b3a7bed4e692c71330b238ba7d87848cd2a841` — doğrulanmamış Bloomberg worker saatini pencereden sonraki öğelerde de `null` yapan düzeltme

Önceki haber/fallback geliştirme commitleri branch geçmişinde korunmaktadır; production'a geçişte branch'in tamamı değil bu dosyada tarif edilen davranışlar esas alınmalıdır.

## Production'a taşıma prosedürü

1. Google Play'deki güncel production sürümüne karşılık gelen doğru production commit'i kesinleştir.
2. O commit'ten yeni, izole bir feature branch aç.
3. Eski test branch'inin `app.js`, `index.html`, Java veya diğer büyük dosyalarını topluca production üzerine kopyalama.
4. Haberler ekranı ve davranışlarını güncel production koduna parça parça port et:
   - navigasyon etiketi / Haberler görünümü
   - responsive Haberler CSS'i ve dock clearance
   - Cüzdan merkez butonu etiketi + yalnız aktifken mavi görünüm
   - kategori chip sınıfları
   - `formatFinanceNewsTime()` ve tarih parse mantığı
   - jenerik haber başlığı filtresi
   - Bloomberg HT orijinal makale metadata doğrulaması
   - doğrulanmamış Bloomberg worker saatlerini tüm sıralarda `null` yapma kuralı
   - finans feed istemcisi
   - native/WebView/AA fallback zinciri
   - gerekli native host allow-list kayıtları
5. Güncel production'da sonradan eklenmiş hesaplama, bildirim, Firebase, backend, Android ve UI düzeltmelerini aynen koru.
6. Önce production tabanından türetilmiş ayrı test APK üret ve cihazda doğrula.
7. Portföy hesapları, hisse ekleme/satış, tekrar alım-ağırlıklı ortalama, bildirimler, paylaşım, navigation ve backend için tam regresyon çalıştır.
8. Canlı source-metadata probe ile orijinal haber başlığı + zamanı doğrula.
9. Yalnız tüm kontrollerden sonra production applicationId/versionCode ve mevcut Play signing zinciriyle `.aab` üret.
10. Production update sırasında paket adı ve Play signing sertifikası değişmemelidir; mevcut kullanıcı verisini koruyan normal güncelleme yolu kullanılmalıdır.

## Taşınmaması gerekenler

- Eski test branch'inin tüm kaynak ağacı
- Test applicationId / test app adı
- Test signing anahtarı
- Eski production davranışlarını geriye götürebilecek tam dosya overwrite'ları
- Haber özelliğinin kapsamı dışında kalan test-only değişiklikler

## Kabul kriterleri

Production port tamamlandı sayılmadan önce:

- `Piyasalar` görünür etiketi yerine `Haberler` görünür.
- Popüler Haberler + Son Haberler ekranı responsive ve kompakt çalışır.
- Son haber satırları floating dock altında kalmaz.
- Cüzdan etiketi görünür ve yalnız Cüzdan aktifken merkez buton mavi görünür.
- 6 finans kategorisi renkli chip olarak görünür.
- Jenerik/kategori başlıkları gerçek haber gibi gösterilmez.
- Bloomberg HT görünür haberlerinde başlık ve zaman orijinal makale metadata'sından doğrulanır.
- Doğrulanmamış Bloomberg worker zamanı hiçbir sıralamada gerçek yayın zamanı gibi gösterilmez.
- Haber zamanı İstanbul saatine göre doğru ve tutarlıdır.
- Zamanı bilinmeyen haber `Güncel` görünür; sahte yayın zamanı üretilmez.
- Finans worker ve AA fallback cihazda çalışır.
- Mevcut production özellikleri için regresyonlar geçer.
- Production package/signing zinciri korunur.
