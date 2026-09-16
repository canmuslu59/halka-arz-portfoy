# Hero kartı ana ekran + görsel paylaşım değişiklik paketi

Bu klasör, 16 Eylül 2026 tarihinde **yalnız test APK'sında** doğrulanan UI/paylaşım değişikliklerini daha sonra canlı uygulamaya yeniden yazmadan uyarlayabilmek için saklar.

## Kaynak ve kapsam

- Çalışma branch'i: `feature/test-hero-card-image-share-20260916`
- Başlangıç branch'i: `test/code29-separate-apk-20260915`
- Test paketi: `com.innative.halkaarz.test`
- Canlı branch/main bu çalışma sırasında değiştirilmemiştir.
- Uygulamanın hesaplama, portföy matematiği, piyasa veri kaynakları, bildirim kuralları, hisse ekleme/satış akışı ve depolama davranışı bu paket kapsamında değildir.

## Taşınabilir uygulama kodu

Bu değişikliklerin uygulanabilir kaynak kodu:

- `scripts/apply-test-share-ui.mjs`

Davranış sözleşmesi/regresyon testi:

- `test/hero-card-image-share-overlay.test.js`

Test APK derleme ve imza doğrulaması:

- `.github/workflows/code29-separate-test-apk.yml`

## Değiştirilen alanlar

Overlay yalnız test derlemesi sırasında aşağıdaki alanları değiştirir:

1. `android/app/src/main/assets/www/index.html`
   - Üst bardaki görseli gerçek launcher icon ile değiştirir.
   - Hero kartına `portfolioHeroCard` kimliği verir.
   - `Toplam portföy büyüklüğü` ve son piyasa veri saati metnini kaldırır.
   - Hero karta görsel paylaşım butonu ekler.

2. `android/app/src/main/assets/www/styles.css`
   - Mobilde hero kartı `100dvh` tabanlı ana ekran yüksekliğine getirir.
   - Performans kartının ilk açılış ekranının altında kalmasını sağlar.
   - Paylaşım yakalaması sırasında paylaş butonunu görselden gizler.

3. `android/app/src/main/assets/www/app.js`
   - Hero kartın ekrandaki koordinatlarını alır.
   - Android native köprüye `shareCardImage(...)` çağrısını iletir.
   - Eski metin paylaşımı yerine görsel paylaşımını tetikler.

4. `android/app/src/main/java/com/innative/halkaarz/MainActivity.java`
   - WebView görünümünü bitmap'e çizer.
   - Yalnız hero kart alanını kırpar.
   - PNG'yi uygulama cache alanına yazar.
   - Android `ACTION_SEND` ile WhatsApp/Telegram/Mesajlar gibi hedeflere görsel paylaşım menüsünü açar.

5. `android/app/src/main/AndroidManifest.xml`
   - Cache görselini güvenli content URI ile paylaşmak için `FileProvider` tanımlar.

6. `android/app/src/main/res/xml/share_file_paths.xml`
   - Yalnız `cache/shared/` yolunu paylaşılabilir yapar.
   - Harici depolama izni istemez.

## Canlıya taşıma kuralı

Test ve canlı kaynakları aynı sürüm olmadığı için bu branch **körlemesine merge/cherry-pick edilmemelidir**. Canlıya geçişte `scripts/apply-test-share-ui.mjs` içindeki ilgili bloklar canlı sürümün güncel `index.html`, `styles.css`, `app.js`, `MainActivity.java` ve manifest yapısına uyarlanmalıdır.

Taşıma sırasında korunması gerekenler:

- Canlı paket adı ve Play kimliği değiştirilmemeli.
- Canlı imzalama anahtarı/test AOSP anahtarıyla karıştırılmamalı.
- Mevcut bildirim, veri ve portföy hesaplama koduna dokunulmamalı.
- Taşıma sonrası canlı branch'in kendi tam regresyon testleri yeniden çalıştırılmalı.

Bu klasörün amacı, değişikliklerin niyetini ve uygulanabilir kodun yerini kalıcı olarak belgelemektir; canlı uygulamaya otomatik olarak uygulanmaz.
