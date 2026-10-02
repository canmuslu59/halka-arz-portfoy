# SAFE RELEASES

Bu dosya, geri dönüş için güvenli kabul edilen sürümleri kalıcı olarak kaydeder.

## Last Known Good — Code41 / v2.5.7

- Durum: **GÜVENLİ GERİ DÖNÜŞ NOKTASI — SİLME**
- İşaretlenme: 2026-10-02, kullanıcı onayıyla (Google Play'de aktif sürüm)
- Branch: `safe/v2.5.7-code41-last-known-good`
- Tag: `v2.5.7-code41`
- Commit: `65ceba959eaabdf41e38e69480569c045bbf160b` (`release/v2.5.7-code41`)
- Kaynak: `af27f22` (Code37 kaynağı) + `6b8bd34` (yalnız versionCode/versionName)
- Release kaydı: `releases/code41/` (README.md, SHA256SUMS.txt, VERIFICATION.txt)
- Production package: `com.innative.halkaarz`
- Version: `2.5.7`
- Version code: `41`
- Play AAB adı: `Hisse-Portfoyum-v2.5.7-Code41-Play.aab`
- Bilinen AAB SHA-256: `f74007bb9f108048de2dd3ae367c8cc4f1b08e055540292a1d7f27d02f4f1109`
- İçerik: Yayınlanmış Code37 (v2.5.4) AAB'si ile imza dışında bayt bayt aynıdır; 205 entry'den yalnız `base/manifest/AndroidManifest.xml` (versionCode/versionName) farklıdır.
- Web paketi hash'leri (Code37 ile aynı):
  - `app.js`: `df2658b0cb532215f6c482e2fb3fb3c0982a455d18dc94c65a7790109586fa15`
  - `styles.css`: `846cfa50a31323ffd9265053a75eff807c7a9f4edf2b328d9ab7508dd88a50cc`
  - `index.html`: `a8ddca67af64118f0db9c9575f832120e76ed53c1e399a9036d15742dbce155c`
- Upload anahtarı: alias `halkaarz-upload`, sertifika SHA-256 `02:D9:F2:98:A5:6B:63:EC:90:67:B9:11:FC:89:89:07:B6:FD:FC:4E:05:91:43:D8:8F:0B:9D:F2:40:22:A2:72`
- Not: Code41'deki bildirim gönderme mekanizması doğru çalışan referanstır. Sonraki sürümlerde Android bildirim sınıfları, `public/core/notification-rules.js`, `market-reference.js`, `market-calendar.js`, `notification-recovery.js`, push backend adresi ve Firebase yapılandırması bu sürümdeki haliyle korunmalıdır.

### Code41'e geri dönüş

Google Play daha düşük bir versionCode kabul etmez. Geri dönüş, Code41 içeriğini Play'deki son koddan **daha yüksek** bir versionCode ile yeniden paketleyip yüklemek demektir.

1. `safe/v2.5.7-code41-last-known-good` dalından yeni bir dal açın (örn. `release/vX.Y.Z-codeNN-rollback41`).
2. `android/app/build.gradle` içinde versionCode'u Play'deki son koddan büyük yapın ve yeni bir versionName verin.
3. `.github/workflows/code40-from-published37.yml` yöntemiyle derleyin; web paketinin yukarıdaki hash'lerle aynı olduğunu doğrulayın.
4. `halkaarz-upload` anahtarıyla imzalayın ve sertifikanın yukarıdaki SHA-256 ile eşleştiğini kontrol edin.

Alternatif: Code41'de olduğu gibi yayınlanmış AAB'nin yalnız manifestindeki versionCode/versionName değiştirilip aynı anahtarla yeniden imzalanabilir.

## Code42 / v2.5.8 — Aday (henüz Last Known Good değil)

- Branch: `release/v2.5.8-code42`
- Release kaydı: `releases/code42/` (README.md, SHA256SUMS-UNSIGNED.txt, NOTIFICATION-BYTECODE.txt)
- İçerik: Code41 bildirim mekanizması + Labs özellikleri (haberler, tutar gizliliği, tema seçimi, yedekleme, yeni ayarlar) + açık mod "Toplam portföy" kontrast düzeltmesi.
- Bildirim mekanizması: 26 bildirim dosyası Code41 ile bayt bayt aynı (`test/code42-labs-production.test.js`); derlenmiş 33 bildirim sınıfının 31'i birebir, 2'sinde yalnız üretimde çalışmayan önizleme yolundaki sürüm numarası farkı.
- İmzasız AAB SHA-256: `5f4f8aa4329e9d7c5499dad8ee21ff6b85dba921e46831ba0c09a0f92671391a` (CI run 37042107933).
- Sorun çıkarsa: Code41'e dön (yukarıdaki adımlar). Play'de sorunsuz çalıştığı onaylanınca Last Known Good olarak işaretlenebilir.
## Önceki güvenli nokta — Code32 / v2.4.9

- Durum: **GÜVENLİ GERİ DÖNÜŞ NOKTASI — SİLME**
- Branch: `safe/v2.4.9-code32-last-known-good`
- Commit: `620210de531dab7502ae55552edb63adbdd8dfe4`
- Production package: `com.innative.halkaarz`
- Version: `2.4.9`
- Version code: `32`
- Play AAB adı: `Hisse-Portfoyum-v2.4.9-Code32-Play(1).aab`
- Bilinen AAB SHA-256: `5a0b77251aaeb4464fc16213892bf8ac9a2633081705152e02b44cb0decc8b8d`
- Not: Bu sürüm, Code33 canlıya alınmadan önce çalışan production sürümüdür. Özellikle market bildirim sistemi için güvenli referans kabul edilmelidir.
- Geri dönüş gerektiğinde bu branch'teki kaynak kullanılmalı; market bildirim çekirdeği yeniden yazılmamalıdır.

## Eski kayıt — Code33 / v2.5.0

- Main'e taşınan release branch: `release/v2.5.0-code33`
- Release source commit: `889cde6155e567b259d25a51c744ea59f99ef864`
- Production package: `com.innative.halkaarz`
- Version: `2.5.0`
- Version code: `33`
- Final Play AAB: `Hisse-Portfoyum-v2.5.0-Code33-Play.aab`
- Final AAB SHA-256: `5e0a4fa958f6567c961b55e04bfa2daf4f19c84ad0fee7ab7e8f5f55b6054503`
- Code33 release doğrulaması: 465/465 test PASS.
- Canlı market notification core, Code32/main referansıyla build öncesi ve dönüşüm sonrası karşılaştırıldı.
- Fake haber preview production'da kapalıdır.

## Kural

Yeni bir production sürümü güvenli kabul edilmeden önce bu dosyadaki "Last Known Good" bölümü değiştirilmemelidir. Code42 ve sonraki sürümler, Play'de sorunsuz çalıştıkları kullanıcı tarafından onaylanana kadar Last Known Good olarak işaretlenmez.
