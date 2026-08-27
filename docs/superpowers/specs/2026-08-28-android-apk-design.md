# Halka Arz Portföy — Bağımsız Android APK Tasarımı

Tarih: 2026-08-28

## Amaç

Mevcut Node.js tabanlı web uygulamasını, Samsung Galaxy S22 Ultra başta olmak üzere Android telefonlara doğrudan kurulabilen ve harici uygulama sunucusu gerektirmeyen bağımsız bir APK'ya dönüştürmek.

Kullanıcı yalnızca hisse kodu ve lot sayısını girer. Uygulama mümkün olduğunda halka arz fiyatını/tarihini ve BIST fiyat verilerini internetten otomatik alır; portföyün günlük ve toplam kârını hesaplar ve verileri cihazda kalıcı olarak saklar.

## Kapsam

### Dahil

- Android APK olarak doğrudan kurulum.
- S22 Ultra ve 360–430 px genişliğindeki telefonlarda mevcut mobile-first kart arayüzünün korunması.
- Hisse kodu + başlangıç lotu ekleme.
- Halka arz fiyatı ve ilk işlem tarihini otomatik bulma; bulunamazsa manuel düzeltme.
- Güncel fiyat ve önceki kapanış üzerinden günlük TL/% değişim.
- Halka arz maliyetine göre toplam TL/% kâr.
- Güncel portföy değeri, başlangıç yatırımı, toplam kâr ve günlük kâr özetleri.
- Satış kaydı: lot + satış fiyatı; gerçekleşen ve gerçekleşmemiş kâr ayrımı.
- 30/90/365 günlük geçmiş grafik.
- Portföy verisinin cihazda yerel ve kalıcı saklanması.
- Uygulama açıldığında ve kullanıcı yenilediğinde fiyat güncellemesi.
- İnternet yokken son başarılı verilerle görüntüleme.
- Veri kaynağı başarısız olduğunda kullanıcıya açık hata durumu ve manuel halka arz bilgisi girişi.

### İlk sürümde dahil değil

- Telefon ile web sürümü arasında otomatik hesap/senkronizasyon.
- Çok kullanıcılı hesap sistemi.
- Arka planda sürekli fiyat takibi veya push bildirimleri.
- Emir gönderme/alım-satım işlemi.
- Borsa lisanslı gerçek zaman veri garantisi.

## Seçilen Mimari

Mevcut HTML/CSS/JavaScript arayüzü korunacak ve Android uygulamasında Capacitor tabanlı yerel kabuk içinde çalıştırılacak. Node.js `server.js` bağımlılığı kaldırılacak.

Sunucudaki üç sorumluluk APK içinde ayrı modüllere taşınacak:

1. **Market Data Service** — BIST fiyat/geçmiş verisini alır ve kısa süreli önbelleğe alır.
2. **IPO Data Service** — halka arz arşivini sorgular, fiyat/tarih bilgisini parse eder, uzun süreli önbelleğe alır.
3. **Portfolio Repository** — hisseler, satışlar, override değerleri ve son piyasa snapshot'larını cihazda saklar.

HTTP istekleri tarayıcı CORS sınırlamasına bağlı kalmaması için Android native HTTP katmanından yapılacak. Arayüz bu servislerle bir JS/Capacitor API katmanı üzerinden konuşacak.

## Yerel Veri Modeli

Her holding için en az şu alanlar tutulacak:

- `id`
- `ticker`
- `initialLots`
- `currentLots`
- `ipoPriceOverride`
- `firstTradeDateOverride`
- `sales[]` (`lots`, `price`, `date`)
- son bilinen `company`, `ipoPrice`, `firstTradeDate`, `source`
- son bilinen `currentPrice`, `previousClose`, `marketTime`
- fiyat geçmişi önbelleği

İlk sürüm için küçük veri hacmi nedeniyle yerel JSON/Preferences tabanlı kalıcı depolama yeterlidir. Veri erişimi tek bir repository arkasında tutulacak; ileride SQLite veya bulut senkronizasyona geçiş arayüzü bozmadan yapılabilir.

## Veri Akışı

### Hisse ekleme

1. Kullanıcı örneğin `KPEKS` ve lot sayısını girer.
2. Kod normalize edilir (`.IS` / `.E` kaldırılır, büyük harfe çevrilir).
3. Market Data Service sembolü doğrular ve fiyat verisini çeker.
4. IPO Data Service halka arz arşivinde kodu arar.
5. Holding yerel depoya kaydedilir.
6. Hesaplanan değerler ekranda gösterilir.
7. IPO bilgisi bulunamazsa holding yine eklenir ve manuel düzeltme uyarısı gösterilir.

### Portföy yenileme

1. Yerel holding listesi anında ekrana basılır.
2. İnternet varsa hisselerin piyasa verileri paralel yenilenir.
3. Yeni snapshot'lar kaydedilir.
4. Günlük ve toplam hesaplar yeniden yapılır.
5. Ağ hatası varsa son başarılı snapshot ekranda kalır ve veri zamanı belirtilir.

## Hesaplama Kuralları

- `başlangıç yatırım = initialLots × ipoPrice`
- `aktif değer = currentLots × currentPrice`
- `gerçekleşen kâr = Σ satılanLot × (satışFiyatı − ipoPrice)`
- `gerçekleşmemiş kâr = currentLots × (currentPrice − ipoPrice)`
- `toplam kâr = gerçekleşen + gerçekleşmemiş`
- `günlük kâr = currentLots × (currentPrice − previousClose)`
- `günlük % = (currentPrice / previousClose − 1) × 100`

Satış sonrası günlük kâr yalnız elde kalan lotlar üzerinden hesaplanır.

## Arayüz

Ana ekran mevcut karanlık mobil tasarımı korur:

- Üstte toplam portföy değeri.
- Başlangıç yatırım, toplam kâr ve bugünkü kâr özet kartları.
- Altında hisse kartları: kod, lot, güncel fiyat, günlük değişim, toplam kâr, aktif değer.
- Floating `+` butonu ile yeni hisse ekleme.
- Hisse detay sheet'i üzerinden satış, manuel IPO düzeltmesi, yenileme ve silme.
- Grafik 30/90/365 günlük aralıklarla.

S22 Ultra için edge-to-edge görünüm, safe-area/inset desteği ve minimum 44–48 dp dokunma alanı kullanılacak. Yatay kaydırma gerekmeyecek.

## Hata Yönetimi

- Market verisi alınamazsa son kayıtlı fiyat gösterilir; `güncellenemedi` uyarısı eklenir.
- IPO kaynağı değişir veya parse edilemezse hisse ekleme engellenmez; manuel fiyat/tarih alanı devreye girer.
- Geçersiz ticker, negatif/0 lot ve elde bulunandan fazla satış istemci tarafında ve repository katmanında reddedilir.
- Yerel kayıt yazımı atomik yapılır; bozuk kayıt durumunda yedek/son geçerli veri korunur.

## Güvenlik ve Gizlilik

- Portföy verileri ilk sürümde yalnız cihazda tutulur.
- Harici sunucuya kullanıcı hesabı veya portföy listesi gönderilmez; yalnız girilen ticker için piyasa/halka arz kaynaklarına HTTP istekleri yapılır.
- APK finansal işlem yapmaz; yalnız takip/hesaplama aracıdır.

## Test Planı

- Ticker normalize etme birim testleri.
- Kâr/zarar hesaplama testleri; kısmi satış ve tam satış senaryoları.
- Yerel repository save/load testleri.
- Ağ başarısızlığında cache fallback testi.
- IPO parser için saklanmış HTML fixture testleri.
- Market JSON parser testleri.
- Android debug APK üzerinde cold start, offline start ve yeniden açma sonrası veri kalıcılığı testi.
- 360 px, 384 px ve S22 Ultra sınıfı ekranlarda responsive UI kontrolü.

## Teslimat

- Kurulabilir debug APK (`halka-arz-portfoy.apk`).
- Android proje kaynak kodu ZIP'i.
- Kısa kurulum notu: Android'de bilinmeyen uygulama kaynağına izin verip APK'yı açma.

## Gelecek Sürüm Yolu

İkinci aşamada aynı repository arayüzüne bulut backend eklenerek telefon + bilgisayar senkronizasyonu, hesap girişi ve cihazlar arası yedekleme yapılabilir. İlk APK buna bağımlı değildir.
