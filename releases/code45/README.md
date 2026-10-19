# Hisse Portföyüm — Code45 / v2.6.1

Bu klasör, Code45 sürümünün kalıcı release kaydıdır. Code45, Play'e yüklenmemiş Code44 / v2.6.0'ın yerini alır.

## Kimlik

- Uygulama: Hisse Portföyüm
- Package: `com.innative.halkaarz`
- Version name: `2.6.1`
- Version code: `45`
- Branch: `release/v2.6.1-code45`, derleme commit'i `6ac704d0be72aad190255a85a1cfb8c0bba88734` (tag `v2.6.1-code45`)
- Derleme: sahibinin bilgisayarında, `code43-final-play-aab.yml` korumalarının yerel karşılığıyla

## İçerik

Code45 = Code43 / v2.5.9 + açılış ekranı + temettü bölümü (Code44) + Firebase Test Lab'de bulunan düzeltmeler.

### Açılış ekranı

- Uygulama her açıldığında ilk karede büyük logo görünür; fiyatlar, geçmiş ve karşılaştırma arka planda hesaplanınca kalkar (en az 650 ms, en fazla 8 sn; native güvenlik süresi 10 sn).
- Fiyat gösteren ekranlara 30 sn'den uzun arka plandan dönüşte aynı akış (6 sn üst sınır); Haberler/Ayarlar'da ve hisse ekleme formu açıkken gösterilmez.
- Web katmanı kurulamazsa (çok eski, güncellenmemiş WebView) logo sayfa yüklendikten 1,5 sn sonra kalkar.
- Bildirim izni ve widget tanıtımı logo kalktıktan sonra sorulur.

### Temettü

- Veri: mevcut günlük geçmiş fiyat isteğinden (`events=div,splits`); ek ağ isteği yok.
- Hak: hak kullanım gününden önceki gün sonunda eldeki lot; alış ve satış tarihleri hesaba katılır.
- Birim: lotlar bugünkü (bedelsiz sonrası) adetle, Yahoo temettü tutarları da bedelsize göre düzeltilmiş; hesap düzeltilmiş tutar × lot. Elle girilen ilan tutarı sonraki bedelsiz oranına bölünür.
- Stopaj: 22.12.2024 öncesi %10, sonrası %15.
- Cüzdan kartı, Temettü Gelirim ekranı (toplam/bu yıl/son 12 ay, yıllık tahmin, verim, temettü dahil getiri, yıllar, hisseler, ödemeler) ve hisse detayında temettü listesi + elle ekleme/gizleme. Açıklama metinleri kaldırıldı.

## Code44'e göre düzeltmeler

1. Temettü bedelsiz birimi: Code44, düzeltilmiş Yahoo tutarlarını geri çarptığı için bedelsiz öncesi ödemeleri oran kadar şişiriyordu (TUPRS ×7, FROTO ×10). Gerçek veriyle toplam 15.859,19 TL yerine 10.073,53 TL.
2. Eski WebView'de logonun 10 sn beklemesi → 1,5 sn.
3. Güvenli alan betiğinin sayfa yüklenirken verdiği `style of null` konsol hatası.
4. Temettü ekranlarındaki açıklama metinleri kaldırıldı; elle ekleme alanlarına etiket eklendi.

Ayrıntı ve Test Lab koşuları: `TESTLAB.txt`.

## Bildirim mekanizması

- Code41 bildirim kilidi bayt bayt aynı. Cloudflare tarafında değişiklik yok.

## Derleme, test ve imza

- Testler: 512/512 PASS. Firebase Test Lab: Android 13/16 sanal ve Samsung Galaxy Z Flip8 (Android 17) fiziksel cihazda PASS.
- İmzasız AAB SHA-256: `e0f1cd71783c3d4f08553f49a335c8938c5e468097a71273ae4fd524c9b75406`.
- Final Play AAB: `Hisse-Portfoyum-v2.6.1-Code45-Play.aab`, SHA-256 `0ec6ddc400ea120efe49c6f1edfb86d40c1965e7c0c7fbb8565dead680c821a1`.
- İmza: `halkaarz-upload`, sertifika `02:D9:F2:98:A5:6B:63:EC:90:67:B9:11:FC:89:89:07:B6:FD:FC:4E:05:91:43:D8:8F:0B:9D:F2:40:22:A2:72`, SHA384withRSA, şifreyi sahibi girdi. `jar verified`, içerik 213/213 aynı.

## Geri dönüş

- Geri dönüş noktası Code41 (`safe/v2.5.7-code41-last-known-good`); versionCode 46+ ile yeniden paketlenir (`SAFE_RELEASES.md`).
- Code45, Play'de sorunsuz çalıştığı onaylanana kadar Last Known Good olarak işaretlenmez.
