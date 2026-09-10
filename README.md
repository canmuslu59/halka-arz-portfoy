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

## Android doğrudan kaynak yapısı

`android/` klasörü, Node.js sunucusuna ihtiyaç duymayan bağımsız Android uygulamasının doğrudan kaynak kodudur. Android kaynakları artık eski sürüm delta/transform dosyaları çalıştırılarak yeniden oluşturulmaz. Üretim web kaynağı `public/` klasörüdür; Android içindeki `android/app/src/main/assets/www/` kopyası `npm run android:sync` ile bu kaynaktan senkronize edilir.

Portföy Android cihazdaki yerel depolamada tutulur ve Android otomatik yedeklemesi kapalıdır. Uygulama piyasa ve halka arz verilerini gerekli HTTPS veri kaynaklarından yeniler; ağ sorunu olduğunda mevcut son geçerli verileri korumaya çalışır. Web ve Android portföyleri arasında otomatik kullanıcı-verisi senkronizasyonu yoktur.

### Phase 1 doğrulaması

Bu aşamada son yayımlanmış Play kimliği korunur: **versionCode 21 / versionName 2.3.9**. Phase 1 doğrulaması Play Store'a gönderilecek imzalı release veya AAB üretmez.

GitHub Actions içindeki **Phase1 TDD Contracts** odaklı davranış kontratlarını; **Audit Current Clean Source** ise doğrudan kaynak ağacını uçtan uca doğrular. Full audit iki test geçişini, `public/` ile Android web varlıklarının birebir eşitliğini, kritik parser/bildirim/navigation kontratlarını, Android release Java kaynak derlemesini, debug derleme kontrolünü ve Phase 1 sırasında AAB üretilmediğini doğrular. Play için imzalı nihai paketleme ayrı release aşamasında yapılır.

### Yerel Android doğrulaması

CI ile aynı doğrulama ortamı için Node.js 22, Java 17, Android SDK 36 ve Gradle 8.11.1 kullanılır. Kaynak ve Android web varlıklarını doğrulamak için:

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

Debug APK yerel olarak `android/app/build/outputs/apk/debug/app-debug.apk` altında oluşur. Bu debug paketi Phase 1 doğrulaması içindir; Play release/AAB paketi değildir.

## Phase 2 release adayı — v2.4.0 / Code22

Temiz Phase 1 kaynak ağacından oluşturulan release adayı **versionCode 22 / versionName 2.4.0** kimliğini kullanır. `release/v2.4.0-code22` dalındaki `Build v2.4.0 Release Candidate` akışı tam test paketini, Android varlık eşitliğini ve release Java derlemesini doğruladıktan sonra **imzasız** bir Android App Bundle üretir.

Play Store'a gönderilecek nihai AAB bu imzasız aday değildir. Güncellemenin Play tarafından kabul edilmesi için daha önceki yayınlarda kullanılan **mevcut upload/private signing key** ile imzalanması gerekir. Release anahtarı veya parolası kaynak depoya eklenmemeli ve yeni bir upload anahtarı oluşturularak eski anahtarın yerine kullanılmamalıdır.
