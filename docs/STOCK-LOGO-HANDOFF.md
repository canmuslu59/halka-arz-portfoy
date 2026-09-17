# BIST Hisse Logoları — Test → Production Handoff

Bu belge, `feature/test-liked-rollback-20260917` test branch'inde portföy hisselerine eklenen şirket logolarının ileride güncel production sürümüne güvenli biçimde taşınması için tutulur.

## Çalışma sınırı

- Main / production değiştirilmedi.
- Test paketi `com.innative.halkaarz.test` olarak kalır.
- Eski test branch'i production'a topluca merge/cherry-pick edilmemelidir.
- Production'a geçişte güncel production commit'i yeni taban olmalı ve yalnız bu logo davranışı port edilmelidir.

## Kaynak ve mimari

İlk denemede Fintables şirket sayfalarından logo URL'si ayrıştırılıyordu. CI canlı probe'unda şirket sayfası HTTP 403 verdiği için runtime scraping yaklaşımı bırakıldı.

Güncel test mimarisi, ticker ile doğrudan adreslenebilen BIST logo setini kullanır:

- Kaynak repo: `ahmeterenodaci/Istanbul-Stock-Exchange--BIST--including-symbols-and-logos`
- Kaynak README'sinde verilerin KAP üzerinden toplandığı belirtilir.
- Runtime CDN şablonu: `https://cdn.jsdelivr.net/gh/ahmeterenodaci/Istanbul-Stock-Exchange--BIST--including-symbols-and-logos/logos/{TICKER}.png`

Şirket sayfası scrape edilmez ve runtime HTML isteği yapılmaz.

## Ticker ve fallback kuralı

- Ticker `trim()` sonrası `toLocaleUpperCase('tr-TR')` ile normalize edilir.
- Yalnız `^[A-Z0-9]+$` biçimindeki semboller logo yoluna alınır.
- Görsel yüklenirse şirket logosu gösterilir.
- Görsel 404/bozuk/ağ hatası verirse mevcut harf avatarı korunur; uygulama kırılmaz veya boş avatar göstermez.
- Logo elementi `referrerPolicy = 'no-referrer'` ve `decoding = 'async'` kullanır.
- `load` event'inde logo açılır ve harf fallback'i kapanır; `error` event'inde logo kapanıp harf fallback'i kalır.

## Canlı kaynak doğrulaması

`.github/workflows/stock-logo-source-probe.yml` şu akışı kontrol eder:

1. BIST sembol listesini kaynaktan alır.
2. Örnek sembollerin listede bulunduğunu doğrular.
3. `GARAN`, `THYAO`, `ASELS`, `BIMAS` için doğrudan CDN logo URL'sini açar.
4. HTTP yanıtının başarılı, `content-type` değerinin `image/*` ve payload'ın anlamlı büyüklükte olmasını şart koşar.

Bu probe kaynak/CDN davranışı değişirse CI'da erken uyarı verir.

## İlgili dosyalar

- `scripts/apply-test-stock-logo-assets.mjs` — doğrudan ticker → logo URL eşleşmesi ve harf fallback davranışı.
- `scripts/apply-test-portfolio-app-navigation.mjs` — logo overlay'ini haber görseli overlay'inden sonra uygular.
- `test/stock-logo-assets.test.js` — doğrudan CDN kullanımı, Fintables runtime scraping'inin olmaması, ticker doğrulaması ve fallback olaylarını test eder.
- `.github/workflows/stock-logo-source-probe.yml` — canlı CDN/source probe'u.

## Dış bağımlılık notu

Logo seti ve jsDelivr harici bir bağımlılıktır. Kaynak repo veya CDN yapısı gelecekte değişebilir. Bu nedenle harf fallback'i kaldırılmamalıdır.

Production için ileride sıfır runtime dış bağımlılık istenirse aynı logolar build sırasında doğrulanıp uygulamanın local asset'lerine vendor edilebilir. Mevcut test sürümünde CDN modeli kullanılır.

## Production'a taşıma

1. Google Play'deki güncel production kaynak commit'ini kesinleştir.
2. O commit'ten izole bir feature branch aç.
3. Eski test branch'inin navigation/app dosyalarını komple production üzerine yazma.
4. Production'daki mevcut holding render yapısına ticker-logo helper ve `load/error` fallback davranışını port et.
5. Production portföy hesaplama, satış, tekrar alım, bildirim, backend ve veri saklama kodlarına dokunma.
6. Kaynak probe'u ve logo testlerini production tabanından türetilmiş test build'inde çalıştır.
7. Birkaç büyük BIST hissesi yanında logo setinde bulunmayan/bozuk bir sembolde harf fallback'ini cihazda doğrula.

## Kabul kriterleri

- Kaynakta logo bulunan BIST hisselerinde şirket logosu görünür.
- Logo bulunmayan veya yüklenemeyen sembolde harf avatarı görünür.
- Ticker üzerinden yanlış/malformed uzak URL üretilemez.
- Runtime'da Fintables şirket sayfası scrape edilmez.
- Logo yükleme hatası hisse kartını veya portföy hesaplarını etkilemez.
- Main/production test geliştirmesi sırasında değiştirilmez.
