# Finans Haber Bildirimleri — Test → Production Handoff

Bu belge `feature/test-liked-rollback-20260917` test branch'inde geliştirilen finans haber bildirimlerinin ileride güncel production sürümüne kontrollü biçimde taşınması için tutulur.

## Çalışma sınırı

- Main / production değiştirilmedi.
- Production Cloudflare worker deploy edilmedi ve haber bildirimleri production ortamında açılmadı.
- Haber push motoru yalnız `NEWS_NOTIFICATIONS_ENABLED=true` **ve** geçerli bir HTTPS `NEWS_FEED_URL` olduğunda çalışır.
- Test branch'i production'a topluca merge/cherry-pick edilmemelidir. Güncel production commit'i yeni taban alınmalı, aşağıdaki davranışlar parça parça port edilmelidir.

## Kullanıcıya görünen davranış

### 1. 5/5 — anlık Son Dakika

- Yalnız gerçekten kritik finans olayları 5/5 olarak sınıflandırılır.
- Başlıkta yalnız `son dakika` yazması tek başına 5/5 nedeni değildir.
- 5/5 haber yayın zamanından itibaren en fazla 30 dakika içinde anlık push için uygundur. Böylece worker yeniden başlatıldığında eski kritik haberler yanlışlıkla Son Dakika olarak yağmaz.
- Başlık: `🔴 Son Dakika`
- Gövde: kısa gerçek haber başlığı.
- Aynı haber aynı kurulum için yalnız bir kez anlık gönderilir (`newsState.breakingSeen`).
- Anlık gönderilmiş 5/5 haber daha sonra sabah/akşam özetinde tekrar kısa başlık olarak yer alabilir.

İlk 5/5 kuralları özellikle muhafazakârdır: TCMB'nin faiz/sistem politikasıyla ilgili açık kararları, Borsa İstanbul genelini etkileyen işlem durdurma/devre kesici benzeri olağanüstü durumlar ve piyasa genelini etkileyen bazı SPK/Hazine düzenlemeleri. Production öncesi gerçek haber örnekleriyle eşik ayrıca kalibre edilmelidir.

### 2. 10:00 — Dünden Kalan Önemliler

Başlık: `📰 Dünden Kalan Önemliler`

- İstanbul saati esas alınır.
- Haber penceresi: önceki gün 19:00 dahil → bugün 10:00 hariç.
- Yalnız önem derecesi 3/5 ve üzeri haberler adaydır.
- 4/5 ve 5/5 haberler önce, sonra 3/5 haberler gelir; aynı önem seviyesinde yenisi önce sıralanır.
- En fazla 4 haber gösterilir.
- En az 2 uygun haber yoksa özet push gönderilmez.
- Her İstanbul günü en fazla bir sabah özeti gönderilir.

### 3. 19:00 — Akşama Düşenler

Başlık: `📰 Akşama Düşenler`

- Haber penceresi: bugün 10:00 dahil → bugün 19:00 hariç.
- Aynı 2–4 haber ve önem sıralama kuralları uygulanır.
- Her İstanbul günü en fazla bir akşam özeti gönderilir.

Özet gövdesi Android BigText bildirimi için en fazla dört kısa madde halinde hazırlanır. Her başlık taşmayı azaltmak için kısaltılır.

## Yayın zamanı güvenliği

- Bir haberin özet veya anlık bildirim penceresine girebilmesi için parse edilebilir `publishedAt` gerekir.
- Haberler ekranında daha önce kurulan gerçek kaynak-zaman doğrulama yaklaşımı korunmalıdır.
- Fetch zamanı veya worker'ın haberi gördüğü an, haber yayın zamanı gibi uydurulmamalıdır.

## Cloud mimarisi

Ana kural motoru:

- `cloudflare/news-notifications.js`
  - `scoreNewsImportance()`
  - `selectDigestItems()`
  - `digestMessage()`
  - `currentDigestSlot()`
  - `createNewsNotificationEngine()`

Cloud bağlantısı:

- `cloudflare/durable-store.js`
- `cloudflare/worker.js`

Feature gate:

- `NEWS_NOTIFICATIONS_ENABLED=true`
- `NEWS_FEED_URL=https://...`

İki koşul birlikte sağlanmadıkça haber push motoru devre dışıdır. Production ortamında bu değişken özellikle açılmadan mevcut borsa/halka arz bildirim davranışı değişmez.

Haber bildirimleri açıkken Durable Object alarmı piyasa kapalı olsa bile 2 dakikalık kontrolü sürdürür. Bu, gece oluşan 5/5 haberlerin ve 10:00 özetinin BIST seans durumuna bağlı kalmaması için gereklidir. Haber feed hatası kendi sonucunda `error` olarak tutulur ve mevcut piyasa/IPO push kontrolünü durdurmamalıdır.

## Android davranışı

`NotificationHelper.java` içinde ayrı kanallar vardır:

- `news_breaking_v1` — `IMPORTANCE_HIGH`, Son dakika haberleri
- `news_digest_v1` — `IMPORTANCE_DEFAULT`, Haber özetleri

Her iki tip de `BigTextStyle` kullanır.

Native tekrar koruması:

- Son dakika: `kind + news_id`
- Özet: `kind + digest_slot + digest_day`

Test APK'da `scripts/apply-test-news-notification-route.mjs`, `news_breaking` ve `news_digest` bildirimi açıldığında doğrudan mevcut `Haberler` sekmesine (`markets` view) yönlendirir.

## Testler

- `test/news-notifications.test.js`
  - 5/5 kritik sınıflandırma
  - 10:00 ve 19:00 İstanbul zaman pencereleri
  - 2–4 haber seçimi
  - kısa başlık/bullet gövdesi
  - breaking de-dupe
  - günlük digest de-dupe
- `test/news-notification-integration.test.js`
  - Android kanalları
  - native de-dupe alanları
  - Haberler route overlay'i
  - Cloud feature gate
  - piyasa kapalı saatlerde haber kontrol alarmı

## Test backend gereksinimi

Gerçek zamanlı cihaz testi yapılırken production push worker kullanılmamalıdır. Ayrı bir Cloudflare test worker oluşturulmalı ve aşağıdakiler yalnız test ortamında verilmelidir:

- ayrı test worker URL'si
- `NEWS_NOTIFICATIONS_ENABLED=true`
- test haber feed URL'si (`halka-arz-portfoy-news-test...`)
- FCM service account secret
- kendi Durable Object state'i

Test APK'nın `PUSH_BACKEND_URL` değeri ancak bu ayrı worker hazır olduktan sonra test worker'a çevrilmelidir. Production worker'a bu feature flag test amacıyla açılmamalıdır.

## Production'a taşıma sırası

1. Play'deki güncel production kaynak commit'ini kesinleştir.
2. O commit'ten izole production-derived branch aç.
3. Önce `news-notifications.js` kural motorunu ve testlerini port et.
4. Cloud bağlantısını feature flag kapalı halde port et ve mevcut piyasa/IPO push regresyonlarını çalıştır.
5. Android iki haber kanalını ve Haberler deep-link davranışını port et.
6. Ayrı test backend + production-derived test APK ile gerçek 10:00, 19:00 ve kontrollü 5/5 senaryolarını doğrula.
7. Yanlış 5/5 oranını gerçek haber örnekleriyle gözden geçir; eşik muhafazakâr kalmalıdır.
8. Ancak doğrulama sonrası production Cloudflare ortamına `NEWS_FEED_URL` verilip `NEWS_NOTIFICATIONS_ENABLED=true` açılabilir.
9. Production AAB aynı package/signing ile ve yükseltilmiş versionCode ile hazırlanır.

## Kabul kriterleri

- 5/5 kritik yeni haber en fazla bir kez anlık gönderilir.
- Eski 5/5 haber Son Dakika olarak gönderilmez.
- Sabah ve akşam özetleri doğru İstanbul penceresinden 2–4 önemli başlık seçer.
- Aynı digest slotu aynı gün ikinci kez gönderilmez.
- Bildirime dokununca Haberler açılır.
- Haber push hatası mevcut portföy/IPO push sistemini bozmaz.
- Feature flag kapalı production ortamında hiçbir haber push davranışı oluşmaz.
- Main/production test geliştirmesi sırasında değiştirilmez.
