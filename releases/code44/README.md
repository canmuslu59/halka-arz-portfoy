# Hisse Portföyüm — Code44 / v2.6.0

Bu klasör, Code44 sürümünün kalıcı release kaydıdır.

## Kimlik

- Uygulama: Hisse Portföyüm
- Package: `com.innative.halkaarz`
- Version name: `2.6.0`
- Version code: `44`
- Branch: `release/v2.6.0-code44`, derleme commit'i `6f6bbdc8e3a35708fd069aeb30315cf123d51696`
- Derleme: sahibinin bilgisayarında, `code43-final-play-aab.yml` korumalarının yerel karşılığıyla (JDK 17, Android SDK 36, Gradle 8.11.1)

## İçerik

Code44 = Code43 / v2.5.9 + açılış ekranı + temettü bölümü.

### Açılış ekranı

- Uygulama her açıldığında ilk karede büyük logo görünür (MainActivity'de native katman; Android 12+ sistem açılış ekranı koyu zemin, `values-v31/themes.xml`).
- Logo arkasında fiyatlar, geçmiş ve karşılaştırma hesaplanır; bitince logo yumuşakça kalkar. Kullanıcı eski → yeni fiyat geçişini görmez.
- Süreler: en az 650 ms görünür, en fazla 8 sn beklenir; web katmanı hiç cevap vermezse native güvenlik süresi 10 sn.
- Fiyat gösteren ekrana (Cüzdan, Hisselerim, Performans, Temettü) 30 sn'den uzun arka plandan dönüşte aynı akış çalışır (6 sn üst sınır). Haberler/Ayarlar ekranlarında ve hisse ekleme formu açıkken gösterilmez.
- Bildirim izni ve widget tanıtımı logo kalktıktan sonra sorulur (önceden açılışın üstüne binebiliyordu).

### Temettü

- Veri: Yahoo temettü ve bedelsiz olayları, zaten yapılan günlük geçmiş fiyat isteğinden (`events=div,splits`) alınır. **Ek ağ isteği yoktur.** Code43 önbelleğinde temettü olmadığı için güncellemeden sonraki ilk açılışta her hisse için geçmiş bir kez yeniden indirilir.
- Hak: hak kullanım (ex-date) gününden önceki gün sonunda eldeki lot. Hak günü satılan lot temettü alır, hak günü alınan almaz.
- Bedelsiz: Yahoo tutarları sonraki bedelsizlere göre düzeltilmiş gelir; ödeme günündeki gerçek hisse başı tutar sonraki split oranlarıyla geri hesaplanır.
- Stopaj: hak kullanım tarihi 22.12.2024 öncesi %10, sonrası %15.
- Cüzdan ana sayfasında özet kart (toplam net, bu yıl, yıllık tahmin, son ödeme). Dokununca **Temettü Gelirim** ekranı açılır:
  - toplam net (brüt/stopaj), bu yıl, son 12 ay, yıllık tahmin, portföy temettü verimi,
  - temettü dahil toplam getiri,
  - yıllara göre temettü, hisse bazında temettü ve verim, ödeme geçmişi.
- Hisse detayında Temettü bölümü: ödeme listesi, elle temettü ekleme (aynı güne girilen kayıt otomatik kaydın yerine geçer), otomatik kaydı gizleme ve geri getirme. Elle kayıtlar portföy verisinde saklanır ve yedeğe dahildir.
- Tutar gizleme modu temettü tutarlarını da bulanıklaştırır.
- Mevcut kâr/zarar, widget ve bildirim hesapları değişmedi; temettü ayrı gösterilir.

## Bildirim mekanizması

- Code41 bildirim kilidindeki tüm dosyalar (Cloudflare gönderim, Android kayıt/alma/zamanlama sınıfları, `data-sources.js`, `http.js`, `notification-rules.js` …) bayt bayt aynı (`test/code42-labs-production.test.js` PASS).
- MainActivity'deki değişiklik yalnız açılış katmanı ve iki yeni köprü metodu (`hideSplash`, `setResumeSplashEnabled`). Bildirim kanalları, izin akışı ve push kaydı aynı.

## Derleme ve doğrulama sonuçları

- Testler: 511/511 PASS (502 mevcut + 9 yeni: `test/code44-dividends-splash.test.js`).
- İmzasız AAB: `Hisse-Portfoyum-v2.6.0-Code44-unsigned.aab`, SHA-256 `869a1d6d7ec5e1fad00bcd247182f45336122c9197161934f2b9d4673005366f` (`SHA256SUMS-UNSIGNED.txt`).
- AAB web paketi commit edilen `android/app/src/main/assets/www` ile aynı (32 dosya, 213 entry).

## İmza

- Play upload alias: `halkaarz-upload`
- Upload sertifikası SHA-256: `02:D9:F2:98:A5:6B:63:EC:90:67:B9:11:FC:89:89:07:B6:FD:FC:4E:05:91:43:D8:8F:0B:9D:F2:40:22:A2:72`
- İmza: sahibinin bilgisayarındaki Play upload anahtarıyla, şifreyi sahibi kendi terminalinde girerek (jarsigner, SHA384withRSA). `jar verified`, sertifika doğrulandı.
- İmzalı ve imzasız paket içeriği imza dosyaları hariç bayt bayt aynı (213/213).
- Final Play AAB: `Hisse-Portfoyum-v2.6.0-Code44-Play.aab`, SHA-256 `7257cfbca14d2079b44a6f3069bb8b4d98bc368077bac4e5caa032344f5ad72f` (`SHA256SUMS.txt`, ayrıntı `VERIFICATION.txt`, `jarsigner-verification.txt`).
- Signing key/keystore ve şifreler repoya eklenmez.

## Geri dönüş

- Code44'te sorun olursa geri dönüş noktası Code41'dir (`safe/v2.5.7-code41-last-known-good` / tag `v2.5.7-code41`). Adımlar `SAFE_RELEASES.md` dosyasında. Play daha yüksek bir versionCode istediği için geri dönüş, Code41 kaynağı yeni bir versionCode (45+) ile derlenerek yapılır.
- Cloudflare tarafında değişiklik yok.
- Code44, Play'de sorunsuz çalıştığı onaylanana kadar Last Known Good olarak işaretlenmez.
