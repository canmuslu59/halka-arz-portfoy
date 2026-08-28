# Halka Arz Portföyüm

Tek kullanıcılı BIST halka arz portföy takip sitesi. Hisse kodu + lot girildiğinde halka arz bilgilerini ve son piyasa fiyatını otomatik bulmaya çalışır; günlük ve toplam kâr/zararı hesaplar.

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

## İnternete yükleme

### Render / Railway / VPS gibi Node.js hosting

1. Bu klasörü GitHub'a yükleyin.
2. Node.js Web Service oluşturun.
3. Build komutu: `npm install`
4. Start komutu: `npm start`
5. Ortam değişkeni olarak `APP_PIN` belirleyin.
6. Kalıcı disk kullanıyorsanız proje içindeki `data/portfolio.json` dosyasının kalıcı diskte tutulduğundan emin olun.

> Önemli: Render/Railway gibi bazı servislerde ücretsiz/standart ephemeral dosya sistemi yeniden başlatmada sıfırlanabilir. Kalıcı portföy için persistent disk ya da bir veritabanı kullanın.

### Docker ile

```bash
docker build -t halka-arz-portfoy .
docker run -p 3000:3000 -e APP_PIN=123456 -v $(pwd)/data:/app/data halka-arz-portfoy
```

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


## Android APK sürümü

`android/` klasörü, Node.js sunucusuna ihtiyaç duymayan bağımsız Android uygulamasıdır. Portföy cihazdaki `SharedPreferences` alanında saklanır; Android otomatik yedeklemesi kapalıdır. Uygulama, BIST ve halka arz verisini doğrudan HTTPS üzerinden yeniler ve internet olmadığında son kaydedilmiş verileri göstermeye devam eder.

### GitHub Actions ile APK üretme

Projeyi bir GitHub deposuna gönderdiğinizde `.github/workflows/android-apk.yml` otomatik olarak debug APK oluşturur. GitHub'da **Actions → Build Android APK → Run workflow** yolunu kullanın. Build tamamlandığında **halka-arz-portfoy-apk** adlı artifact içindeki `halka-arz-portfoy.apk` dosyasını telefona indirip kurabilirsiniz.

Workflow; Node.js testlerini çalıştırır, Android SDK 35 ve build-tools 35.0.0 kurar, web varlıklarını Android uygulamasına senkronlar ve Gradle 8.11.1 ile `assembleDebug` çalıştırır. V2 ile birlikte debug APK, projedeki sabit `halkaarz-debug.keystore` ile imzalanır; böylece bu sürümden sonraki APK dosyaları mevcut uygulamanın üstüne güncelleme olarak kurulabilir. Bu anahtar kişisel/sideload kullanım içindir; Play Store yayını için ayrı ve gizli bir release anahtarı kullanılmalıdır.

### Android Studio / yerel Gradle ile derleme

Android SDK 35, build-tools 35.0.0, Java 17 ve Gradle 8.11.1 kurulu bir bilgisayarda:

```bash
npm ci
npm test
npm run android:sync
gradle -p android --no-daemon assembleDebug
```

APK şu konumda oluşur:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

### Samsung S22 Ultra'ya kurma

APK'yı telefona aktarın ve dosyayı açın. Android isterse APK'yı açtığınız uygulama için **Bilinmeyen uygulamaları yükle** iznini verin. Ardından **Yükle** seçeneğine dokunun. Uygulama 360–430 px mobil genişlikler, ekran çentiği/safe-area ve S22 Ultra sınıfı ekranlar için responsive hazırlanmıştır.

> Veriler yalnızca cihazda tutulur; web sürümüyle otomatik senkronizasyon yoktur. Önceki V1 APK geçici GitHub debug anahtarıyla imzalandıysa V2 ilk kurulumunda imza uyuşmazlığı nedeniyle eski uygulamayı kaldırmak gerekebilir. V2 kurulduktan sonra sabit imza anahtarı sayesinde sonraki güncellemeler üstüne kurulabilir. Eski uygulamayı kaldırmadan önce hisse kodu/lot ve varsa satış kayıtlarını not edin.
