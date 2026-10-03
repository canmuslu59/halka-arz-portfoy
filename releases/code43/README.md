# Hisse Portföyüm — Code43 / v2.5.9

Bu klasör, Code43 sürümünün kalıcı release kaydıdır.

## Kimlik

- Uygulama: Hisse Portföyüm
- Package: `com.innative.halkaarz`
- Version name: `2.5.9`
- Version code: `43`
- Branch: `release/v2.5.9-code43`, derleme commit'i `69d2b206e4df66bd08bc9cdb98bbf01ac29d6cea` (tag `v2.5.9-code43`)
- Derleme: `.github/workflows/code43-final-play-aab.yml` (GitHub Windows sunucusu)

## İçerik

Code43 = Code42 / v2.5.8 + haber bildirimi iyileştirmeleri:

- **Habere doğrudan gitme:** Haber bildirimine dokununca Haberler ekranı yerine haberin kendisi açılır. Bildirim verisine `news_url` eklendi (son dakika, tek haberli özet, rutin haber). Link yoksa eskisi gibi Haberler ekranı açılır. Yalnız `https://` linkleri kabul edilir.
- **Sade başlıklar:** Özet ve rutin haber başlıklarında emoji yok ("Sabah Finans Özeti", "Akşam Finans Özeti", "Faiz ve Piyasa Gündemi"…). Emoji yalnız son dakikada kalır: `🔴 Son Dakika` veya portföy haberinde `🔴 Son Dakika · HİSSE`.
- **Daha akıllı son dakika:** "önem 5/5" kuralı yerine dört kategori:
  1. Portföydeki şirketler: elde lotu olan hissenin kodu başlıkta/özette geçiyor ve kurumsal olay var (bedelli/bedelsiz, temettü, geri alım, birleşme/devralma, bilanço, KAP, işlem durdurma, tedbir, soruşturma…). Bulut hisse koduyla eşleştirir. Telefondaki yedek işçi şirket adından da eşleştirir.
  2. Faiz ve merkez bankaları: TCMB/PPK, Fed, ECB vb. faiz kararı ya da olağanüstü toplantı.
  3. Piyasa ve kur şokları:
     - Borsa geneli işlem durdurma veya devre kesici.
     - BIST/borsa, Nasdaq, Dow Jones, S&P 500 ya da DAX'ta %3 ve üzeri hareket; "çöktü", "panik satış" gibi çöküş ifadeleri.
     - Fonlarda işlem/geri ödeme durdurma.
     - Dolar, euro ya da sterlinde %2 ve üzeri ya da "sert/ani/şok" hareket; altında %3 ve üzeri hareket ya da rekor.
  4. Düzenleyici ve yaptırım:
     - SPK, BDDK, MASAK, TCMB, Hazine ve Maliye ya da Resmî Gazete kaynaklı ve piyasa geneline etki eden düzenlemeler (açığa satış, vergi/stopaj, kredi kartı/taksit, mevduat, kripto, yatırım fonu…).
     - Finansla bağlantılı gözaltı, tutuklama, mal varlığı dondurma, kayyum/TMSF.
     - Bakan açıklamaları yalnız ekonomiyle ilgiliyse ve açıklanmışsa sayılır (yalnız "açıklayacak/bekleniyor" diyenler sayılmaz).
  Soru biçimindeki açıklayıcı başlıklar ("… nedir?", "… ne zaman?") elenir.
- **Sıklık sınırı:** Bir turda en fazla 1 son dakika, iki son dakika arasında en az 10 dakika, günde en fazla 8. Konu bekleme süreleri: faiz 60 dk, piyasa 30 dk, aynı hisse 2 saat, düzenleyici 60 dk, yaptırım 60 dk, kur 6 saat. Aynı kurallar Cloudflare (`cloudflare/news-notifications.js`) ve telefondaki yedek işçide (`BreakingNewsRules.java`) birebir aynıdır; `test/news-breaking-rules.test.js` iki tarafı aynı örneklerle karşılaştırır.

## Bildirim gönderme mekanizması

- Gönderim altyapısına dokunulmadı: `cloudflare/worker.js`, `durable-store.js`, `fcm-sender.js` git blob SHA ile kilitli (değişmedi). Kayıt (`PushConfigSync`), FCM alma (`PushMessagingService`), zamanlama ve portföy uyarıları (`BackgroundAlert*`, `PortfolioAlertRules`) Code41 ile bayt kodu düzeyinde aynı.
- Bilerek değişen yalnız haber bildiriminin gösterimi ve seçimi: `NotificationHelper` (haber linki, son dakika kaydı), `NewsNotificationFormatter` (sade başlık), `NewsTestWorker` (yeni seçim), yeni `BreakingNewsRules`. Ayrıntı: `NOTIFICATION-BYTECODE.txt`.
- Bildirim kanalları, izin kontrolü, günlük tekrar engeli ve FCM veri biçimi aynı. Yeni veri alanları (`news_url`, `breaking_reason`, `ticker`) eski uygulamalarca yok sayılır.

## Cloudflare (canlı)

- Son dakika kuralları push Worker'ına alındı: sürüm `486c22bd-32a9-4c6f-8a3a-05745c078ff0`. Geri dönüş noktası önceki sürüm `b89a6b0e-f367-470c-86e4-40cd771f152e`.
- İlk deneme doğrulama betiğindeki yanlış alarmla otomatik geri alındı; düzeltilip yeniden yayınlandı. Ayrıntı: `CLOUD-DEPLOY.txt`.

## Derleme ve doğrulama sonuçları

- CI run: `37141421469` — başarılı.
- Testler: 502/502 PASS.
- İmzasız AAB: `Hisse-Portfoyum-v2.5.9-Code43-unsigned.aab`, SHA-256 `9680568c38f2d24fd35f798247487d325d5f925d3f96be1b8e1d8393212304fe` (`SHA256SUMS-UNSIGNED.txt`).

## İmza

- Play upload alias: `halkaarz-upload`
- Upload sertifikası SHA-256: `02:D9:F2:98:A5:6B:63:EC:90:67:B9:11:FC:89:89:07:B6:FD:FC:4E:05:91:43:D8:8F:0B:9D:F2:40:22:A2:72`
- İmza: sahibinin bilgisayarındaki Play upload anahtarıyla, şifreyi sahibi girerek (jarsigner). Ayrıntı: `VERIFICATION.txt`.
- Signing key/keystore ve şifreler repoya eklenmez.

## Geri dönüş

- Uygulama: Code43'te sorun olursa geri dönüş noktası Code41'dir (`safe/v2.5.7-code41-last-known-good` / tag `v2.5.7-code41`). Adımlar `SAFE_RELEASES.md` dosyasında. Play daha yüksek bir versionCode istediği için geri dönüş, Code41 kaynağı yeni bir versionCode ile derlenerek yapılır.
- Cloudflare: Worker'ı `b89a6b0e…` sürümüne almak yeterli (`CLOUD-DEPLOY.txt`).
- Code43, Play'de sorunsuz çalıştığı onaylanana kadar Last Known Good olarak işaretlenmez.
