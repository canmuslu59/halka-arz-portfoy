# Live Code29 Piyasa Bildirim Paritesi — Test Sürümü

Bu belge, canlıda kusursuz çalıştığı kabul edilen Code29 piyasa bildirim/fiyat alma çekirdeğinin `feature/test-liked-rollback-20260917` test sürümünde korunmasını kayıt altına alır.

## Referans

- Bilinen çalışan canlı/Code29 referans branch: `fix/code29-close-fallback-20260915-final`
- Referans commit: `db8861f7c2314da12734c0f14ca41958184c82a9`
- Hedef test branch: `feature/test-liked-rollback-20260917`
- `main` / production bu çalışma sırasında değiştirilmez.

## Korunan fiyat ve bildirim zinciri

Piyasa bildirimi çekirdeği yeniden tasarlanmamıştır. Test sürümünde canlı Code29 davranışı otorite kabul edilir.

1. Anlık/gün içi fiyat: Yahoo Finance chart endpoint'i.
2. Taban/tavan ve önceki kapanış için doğrulanmış referans birincil kaynak: Foreks.
3. Foreks başarısızsa doğrulanmış ikinci kaynak: OYAK Yatırım.
4. Taban/tavan kararı sentetik ±%10 hesapla değil, kaynakta verilen `floorPrice` / `ceilingPrice` ile yapılır.
5. Gelen anlık fiyat doğrulanmış taban-tavan aralığının dışında ise kayıt/bildirim için geçerli sayılmaz.
6. Aynı hisse için aynı gün başarılı şekilde gönderilen `ceiling` / `floor` state'i saklanır; aynı olay tekrar gönderilmez.
7. Portföy artış/düşüş eşikleri mevcut `PortfolioAlertRules` ve canlı Code29 örnekleme/eşik mantığını kullanır.
8. Push config `marketReferenceProtocol=2` ve `trustedMarketEnabled` sözleşmesini korur; eski Yahoo-only backend'in yanlış piyasa uyarısı üretmesini önleyen uyumluluk davranışı değişmez.

## Byte-for-byte aynı kalan çekirdekler

İnceleme sırasında aşağıdaki dosyaların referans Code29 ile test branch'inde aynı blob olduğu doğrulandı:

- `BackgroundAlertWorker.java` — `5474484163e63853e9b6639199cc92b9467f11ef`
- `PushConfigSync.java` — `2636caca40f5eb5ed44bfb80bc2f9e8fe539f25b`
- `PortfolioAlertRules.java` — `c72d08ce80c472896107117428beece1d2f6beca`
- `NativeHttpPolicy.java` — `2d0d691ae5b5207c5743bf3193dba0028135578c`
- `BackgroundAlertScheduler.java` — `7d911722cdbd0f7fd1a96317752399c232a6e5e3`
- `backend/alert-engine.js` — `cd26661256c7edfa8790333a7bb6171ba1304c69`
- `backend/service.js` — `88e487a578756fb85c481e1c4a1ed46668fc1a03`
- `public/core/notification-rules.js` — `e953ca7205b133af2724b39a0d4ff4c6739fa013`

Bu dosyalar sırf "canlıdan taşıma" amacıyla tekrar kopyalanmamalıdır; zaten çalışan canlı çekirdeği taşımaktadırlar.

## NotificationHelper özel durumu

Test sürümündeki `NotificationHelper.java`, sonradan eklenen haber bildirim kanalları (`news_breaking_v1`, `news_digest_v1`) nedeniyle Code29'dan bilinçli olarak daha geniştir.

Haber geliştirmesi sırasında Android notification `requestCode` hesabı tüm bildirim türleri için `eventKey.hashCode()` biçimine genellenmişti. Piyasa bildirimlerinin canlı Code29 davranışını birebir korumak için bu kısım ayrıştırıldı:

- `news_breaking` ve `news_digest`: kendi yeni `eventKey` kimliğini kullanır.
- Diğer mevcut bildirim türleri (tavan, taban, portföy artış/düşüş, IPO vb.): canlı Code29 formülünü korur: `(kind + ":" + ticker + ":" + body).hashCode()`.

Mevcut piyasa kanal ID'leri ve sesleri değişmez:

- `market_rise_v1`
- `portfolio_fall_v1`
- `market_ceiling_coin_v1`
- `market_floor_v1`
- `new_ipos`

## Regresyon kilidi

`test/live-code29-market-alert-parity.test.js` aşağıdaki sözleşmeleri sürekli kontrol eder:

- Yahoo anlık fiyat kaynağı
- Foreks → OYAK doğrulanmış referans fallback sırası
- explicit previous close / ceiling / floor kullanımı
- günlük tavan/taban de-dup state'i
- portföy artış/düşüş eşikleri
- `marketReferenceProtocol=2` / `trustedMarketEnabled`
- eski piyasa bildirimlerinin canlı Code29 requestCode kimliği
- haber bildirimlerinin ayrı kimlik kullanabilmesi

Bu test tam `npm test` paketinin parçasıdır ve APK workflow'unda tam regresyon adımında çalışır.

## Değiştirilmemesi gerekenler

Production'a veya başka testlere taşırken şu çekirdek davranışlar yeniden yazılmamalıdır:

- Yahoo current quote alma biçimi
- Foreks birincil, OYAK ikinci doğrulanmış piyasa referansı
- taban/tavan explicit referans fiyatları ve toleransları
- günlük taban/tavan delivered state
- `PortfolioAlertRules`
- `PushConfigSync` güvenli protokol davranışı
- mevcut piyasa notification channel ID/sesleri ve de-dup mantığı

Haberler ve haber bildirimleri bu çekirdeğin çevresine eklenebilir; piyasa çekirdeğini değiştirmemelidir.

## Test APK kuralı

Bu çalışma yalnız test uygulamasında doğrulanır:

- applicationId: `com.innative.halkaarz.test`
- production package/signing değiştirilmez.
- production Cloudflare worker deploy edilmez.
- production haber bildirim feature flag'i açılmaz.
