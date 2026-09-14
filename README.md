# Halka Arz Portföyüm

Tek kullanıcılı BIST halka arz portföy takip sitesi ve Android uygulaması. Hisse kodu + lot girildiğinde halka arz bilgilerini ve son piyasa fiyatını otomatik bulmaya çalışır; günlük ve toplam kâr/zararı hesaplar.

## Özellikler

- Hisse kodu + lot ile hızlı ekleme
- Halka arz fiyatı ve ilk işlem tarihini otomatik bulma
- Son fiyat, önceki kapanış ve günlük kâr/zarar
- Halka arzdan bugüne toplam kâr/zarar
- Başlangıç yatırımı, aktif portföy, satış nakdi ve toplam portföy büyüklüğü
- Satış kaydı: gerçekleşen / gerçekleşmemiş kâr ayrımı
- 30 / 90 / 365 gün ve tüm dönem için portföy büyüklüğü grafiği
- Grafiğe dokununca tarih, portföy büyüklüğü, günlük ve toplam kâr/zarar
- Gün gün geçmiş kâr/zarar ve günlük büyüme tablosu
- Bugünkü TL / %, toplam kâr / %, güncel değer ve koda göre hisse sıralama
- Aktif portföy değerine göre sektör dağılımı
- BIST açık/kapalı ve sonraki seans açılış zamanı
- Mobil-first responsive arayüz (Samsung S22 Ultra dahil)
- PWA: telefonda ana ekrana eklenebilir
- İsteğe bağlı APP_PIN ile basit tek kullanıcı koruması
- Otomatik veri bulunamazsa halka arz fiyatı/tarihi/sektörü manuel düzeltme
- Android geri tuşunda önce sayfa/detay geri dönüşü; ana ekranda çıkmak için çift geri
- Önce cihaz önbelleğini gösteren, ağ yenilemelerini arka planda yapan hızlı açılış
- Android bildirimleri için Cloudflare Worker + D1 + Firebase Cloud Messaging altyapısı

## Veri kaynakları

- Piyasa fiyatı/geçmişi: Yahoo Finance'ın herkese açık fakat resmi API garantisi olmayan chart uç noktası (`BISTKODU.IS`). Veriler gecikmeli olabilir.
- Halka arz bilgileri: Ahlatcı Yatırım halka arz arşivi; 2026 için Fibabanka yedek kaynak.

Bu kaynakların HTML/API yapıları üçüncü taraflarca değiştirilebilir. Bu yüzden uygulamada manuel düzeltme alanı bulunur. Gerçek zamanlı, lisanslı BIST verisi istenirse ayrıca ücretli/lisanslı bir veri sağlayıcı entegrasyonu gerekir.

## Bilgisayarda çalıştırma

Node.js 20+ kurulu olmalı.

```bash
npm install
npm start
```

Sonra tarayıcıda:

```text
http://localhost:3000
```

### PIN eklemek

Windows PowerShell:

```powershell
$env:APP_PIN="123456"
npm start
```

Linux/macOS:

```bash
APP_PIN=123456 npm start
```

## Web uygulamasını internete yükleme

`server.js` ile çalışan web uygulaması herhangi bir Node.js 20+ barındırma ortamında çalıştırılabilir. Web sunucusunun depolama ihtiyacı, Android push altyapısından bağımsızdır. Kalıcı portföy dosyası kullanılıyorsa `data/portfolio.json` için kalıcı disk veya veritabanı tercih edilmelidir.

### Docker ile

```bash
docker build -t halka-arz-portfoy .
docker run -p 3000:3000 -e APP_PIN=123456 -v $(pwd)/data:/app/data halka-arz-portfoy
```

## Android push bildirim altyapısı

Üretim push altyapısı ücretli sürekli açık Node sunucusu kullanmaz. Bildirim akışı şöyledir:

1. Android uygulaması FCM tokenını ve bildirim ayarlarını `PUSH_BACKEND_URL/v1/installations` adresine HTTPS ile kaydeder.
2. `cloudflare/worker.js`, Cloudflare Cron tarafından `*/2 * * * *` ifadesiyle yaklaşık iki dakikada bir tetiklenir.
3. BIST açık olduğunda Worker gerekli hisselerin fiyatlarını kontrol eder; portföy yükseliş/düşüş eşikleri ile tavan/taban olaylarını mevcut günlük dedupe kurallarıyla değerlendirir.
4. Bildirim Firebase Cloud Messaging HTTP v1 üzerinden data-only/high-priority mesaj olarak Android'e gider.
5. Android `NotificationHelper` kendi kanal, izin ve günlük tekrar kontrollerini uygular.
6. Android WorkManager tarafındaki 15 dakikalık yerel kontrol yedek mekanizma olarak korunur.

Cloudflare kalıcı kayıtları D1 veritabanında tutulur. Şema `migrations/0001_push_backend.sql`, Worker yapılandırması `wrangler.jsonc` içindedir. Firebase Admin kimlik bilgisi yalnızca Cloudflare encrypted secret olarak `FIREBASE_SERVICE_ACCOUNT_JSON` adıyla saklanmalıdır. `google-services.json`, Firebase private key, Play imza anahtarı ve parolalar kaynak depoya eklenmemelidir.

Yerel Cloudflare komutları:

```bash
npm run cf:dev
npm run cf:migrate:local
npm run cf:migrate:remote
npm run cf:deploy
```

Üretim Android AAB oluşturulurken `PUSH_BACKEND_URL` gerçek deploy edilmiş Worker HTTPS adresi olmalıdır. Boş veya HTTP bir backend adresiyle Play release üretilmez.

## Telefon kurulumu

Siteyi Samsung Internet veya Chrome'da açın ve menüden **Ana ekrana ekle / Uygulamayı yükle** seçeneğini kullanın. Arayüz 360–430 px mobil genişlikler için ayrıca optimize edilmiştir.

## Hesap mantığı

- **Yatırılan:** halka arz fiyatı × başlangıç lotu
- **Aktif değer:** güncel fiyat × eldeki lot
- **Satış nakdi:** kaydedilmiş satış fiyatı × satılan lot
- **Toplam portföy büyüklüğü:** aktif değer + satış nakdi
- **Gerçekleşen kâr:** (satış fiyatı − halka arz fiyatı) × satılan lot
- **Gerçekleşmemiş kâr:** (güncel fiyat − halka arz fiyatı) × eldeki lot
- **Toplam kâr:** gerçekleşen + gerçekleşmemiş
- **Bugünkü kâr:** (son fiyat − önceki kapanış) × eldeki lot

Bedelsiz sermaye artırımı, temettü, ek alım, komisyon/vergi gibi olaylar bu ilk sürümde otomatik portföy hareketi olarak işlenmez. Bu durumlarda lot veya maliyet bilgisinin geliştirilmiş işlem defteri sürümünde takip edilmesi gerekir.

## Yasal not

Uygulama kişisel portföy takibi içindir; yatırım tavsiyesi üretmez. Ücretsiz piyasa kaynakları gecikmeli veya eksik veri sunabilir.

## Android doğrudan kaynak yapısı

`android/` klasörü, Node.js web sunucusuna ihtiyaç duymayan bağımsız Android uygulamasının doğrudan kaynak kodudur. Üretim web kaynağı `public/` klasörüdür; Android içindeki `android/app/src/main/assets/www/` kopyası `npm run android:sync` ile bu kaynaktan senkronize edilir.

Portföy Android cihazdaki yerel depolamada tutulur ve Android otomatik yedeklemesi kapalıdır. Uygulama piyasa ve halka arz verilerini gerekli HTTPS veri kaynaklarından yeniler; ağ sorunu olduğunda mevcut son geçerli verileri korumaya çalışır. Web ve Android portföyleri arasında otomatik kullanıcı-verisi senkronizasyonu yoktur.

### Yerel Android doğrulaması

Release CI ile aynı doğrulama ortamı için Node.js 22, Java 17, Android SDK 36 ve Gradle 8.11.1 kullanılır. Kaynak ve Android web varlıklarını doğrulamak için:

```bash
npm ci
npm test
npm run android:sync
diff -qr public android/app/src/main/assets/www
gradle -p android --no-daemon compileReleaseJavaWithJavac
```

Windows'ta `diff -qr` yerine Git ile senkronizasyon sonrasında `android/app/src/main/assets/www` altında beklenmeyen değişiklik olmadığını kontrol edebilirsiniz.

Cihazda geliştirme amaçlı debug APK gerekiyorsa ayrıca:

```bash
gradle -p android --no-daemon assembleDebug
```

Debug APK yerel olarak `android/app/build/outputs/apk/debug/app-debug.apk` altında oluşur. Bu debug paketi geliştirme doğrulaması içindir; Play release/AAB paketi değildir.

## Code28 release — v2.4.6 / versionCode 28

Play hedefi `versionName 2.4.6 / versionCode 28` olarak korunur. Nihai AAB, gerçek Cloudflare Worker HTTPS adresi ve Firebase Android yapılandırması ile derlenmeli; daha önceki yayınlarda kullanılan mevcut Play upload/private signing key ile imzalanmalıdır. Release anahtarı veya parolası kaynak depoya eklenmemeli ve farklı bir upload anahtarıyla imza zinciri değiştirilmemelidir.
