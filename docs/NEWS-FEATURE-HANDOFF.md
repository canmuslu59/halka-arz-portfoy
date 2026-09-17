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

- Popüler kart genişliği `clamp(...)` ile ekran genişliğine uyarlanır.
- Popüler haber medya alanı `aspect-ratio: 16/9` kullanır.
- Başlık maksimum 3 satırdır.
- Son Haberler görsel/metin kolonları `clamp(...)` ile ölçeklenir.
- Küçük telefonlar için `max-width: 390px` düzeni vardır.
- Daha geniş ekranlar için `min-width: 600px` düzeni vardır.

Ana uygulama/portföy layout hesapları bu değişikliğin kapsamına dahil değildir.

## Haber zamanı kuralı

Haberlerde genel uygulama `timeAgo()` fonksiyonu kullanılmaz. Haberler için `formatFinanceNewsTime()` kullanılır ve `Europe/Istanbul` saat dilimi esas alınır.

Gösterim:

- 1 saatten yeni: `12 dk önce`
- Aynı gün: `3 saat önce`
- Bir önceki İstanbul takvim günü: `Dün 14:25`
- Daha eski: `16 Eyl • 10:40`
- Kaynak zamanı yok/parse edilemiyor: `Güncel`

Timezone bilgisi taşımayan haber zamanı İstanbul saati (`+03:00`) kabul edilir. Gelecekte görünen şüpheli saatlerde kullanıcıya uydurma relatif zaman gösterilmez.

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

Android native allow-list'te test worker hostu ve AA hostları bulunmalıdır.

## İlgili dosyalar

Feature/overlay:

- `scripts/apply-test-popular-finance-news.mjs`
- `scripts/apply-test-popular-finance-news-fallback.mjs`
- `scripts/apply-test-portfolio-app-navigation.mjs` — yukarıdaki overlay'leri test build'ine uygular

Testler:

- `test/popular-finance-news-overlay.test.js`
- mevcut portföy / navigation / repeated-purchase regresyon testleri de build sırasında çalışır

Build:

- `.github/workflows/popular-finance-news-test-apk.yml`
- `.github/workflows/news-android-ua-probe.yml` yalnız ağ/fallback teşhisi için kullanılır

## Bu görsel/zamanlama turundaki önemli commitler

- `1c13e4cfa8dd1396aa904193cc5a746ccf2d6f9e` — zaman, kategori rengi ve responsive tasarım sözleşmelerini testle tanımlar
- `235ea71a5941d67f89821ab785a8ce0046b27912` — responsive tasarım, renkli kategoriler ve İstanbul-aware haber zamanını uygular
- `d6685caafac74baefa4dec1254a58a0602e546d7` — AA fallback'in sahte yayın zamanı üretmemesi için regresyon testi
- `ac4b467fcfc3f1aa203e94b56f1fb69fb14cdec6` — AA fallback'te bilinmeyen zamanı `null` bırakır

Önceki haber/fallback geliştirme commitleri branch geçmişinde korunmaktadır; production'a geçişte branch'in tamamı değil bu dosyada tarif edilen davranışlar esas alınmalıdır.

## Production'a taşıma prosedürü

1. Google Play'deki güncel production sürümüne karşılık gelen doğru production commit'i kesinleştir.
2. O commit'ten yeni, izole bir feature branch aç.
3. Eski test branch'inin `app.js`, `index.html`, Java veya diğer büyük dosyalarını topluca production üzerine kopyalama.
4. Haberler ekranı ve davranışlarını güncel production koduna parça parça port et:
   - navigasyon etiketi / Haberler görünümü
   - responsive Haberler CSS'i
   - kategori chip sınıfları
   - `formatFinanceNewsTime()` ve tarih parse mantığı
   - finans feed istemcisi
   - native/WebView/AA fallback zinciri
   - gerekli native host allow-list kayıtları
5. Güncel production'da sonradan eklenmiş hesaplama, bildirim, Firebase, backend, Android ve UI düzeltmelerini aynen koru.
6. Önce production tabanından türetilmiş ayrı test APK üret ve cihazda doğrula.
7. Portföy hesapları, hisse ekleme/satış, tekrar alım-ağırlıklı ortalama, bildirimler, paylaşım, navigation ve backend için tam regresyon çalıştır.
8. Yalnız tüm kontrollerden sonra production applicationId/versionCode ve mevcut Play signing zinciriyle `.aab` üret.
9. Production update sırasında paket adı ve Play signing sertifikası değişmemelidir; mevcut kullanıcı verisini koruyan normal güncelleme yolu kullanılmalıdır.

## Taşınmaması gerekenler

- Eski test branch'inin tüm kaynak ağacı
- Test applicationId / test app adı
- Test signing anahtarı
- Eski production davranışlarını geriye götürebilecek tam dosya overwrite'ları
- Haber özelliğinin kapsamı dışında kalan test-only değişiklikler

## Kabul kriterleri

Production port tamamlandı sayılmadan önce:

- `Piyasalar` görünür etiketi yerine `Haberler` görünür.
- Popüler Haberler + Son Haberler ekranı responsive çalışır.
- 6 finans kategorisi renkli chip olarak görünür.
- Haber zamanı İstanbul saatine göre doğru ve tutarlıdır.
- Zamanı bilinmeyen haber `Güncel` görünür; sahte yayın zamanı üretilmez.
- Finans worker ve AA fallback cihazda çalışır.
- Mevcut production özellikleri için regresyonlar geçer.
- Production package/signing zinciri korunur.
