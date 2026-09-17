# Haber Görselleri — Test → Production Handoff

Bu belge, `feature/test-liked-rollback-20260917` test branch'inde Haberler ekranına eklenen gerçek makale görsellerinin ileride güncel production sürümüne güvenli biçimde taşınması için tutulur.

## Çalışma sınırı

- Main / production değiştirilmedi.
- Test paketi `com.innative.halkaarz.test` olarak kalır.
- Bu branch eski test tabanı olduğu için branch'in tamamı production'a merge/cherry-pick edilmemelidir.
- Production'a geçişte güncel production commit'i yeni taban alınmalı ve bu özellik davranış bazında port edilmelidir.

## Davranış

Haber kartı için gerçek makale görseli orijinal haber metadata'sından alınır. Arama önceliği:

1. `meta[property="og:image"]`
2. `meta[property="og:image:secure_url"]`
3. `meta[name="twitter:image"]` / eşdeğer Twitter image meta alanı
4. JSON-LD içindeki `image`, `contentUrl` veya görsel nesnesi

Göreli görsel URL'leri makalenin kendi URL'sine göre çözülür. Yalnız `https:` görseller kabul edilir.

## UI kullanımı

- `Popüler Haberler` büyük kartında gerçek makale görseli `.news-feature-image` ile gösterilir.
- `Son Haberler` satırında aynı `imageUrl` `.news-latest-image` thumbnail'ı olarak kullanılır.
- Görsel `loading="lazy"`, `decoding="async"` ve `referrerpolicy="no-referrer"` ile yüklenir.
- Görsel yüklenemezse `onerror` ile gizlenir; mevcut kategoriye özgü renkli/soyut art fallback'i görünmeye devam eder.
- Gerçek görsel geldiğinde kategori chip'i görünür kalır; görsel chip veya başlık katmanını kapatmamalıdır.
- Görseller `object-fit: cover` ile kart alanına oturur.

## İlgili dosyalar

- `scripts/apply-test-news-article-images.mjs` — orijinal makale görsel metadata'sını çıkarır ve iki haber görünümüne bağlar.
- `scripts/apply-test-portfolio-app-navigation.mjs` — bu overlay'i `apply-test-news-layout-polish-v2.mjs` sonrasında uygular.
- `test/news-article-images.test.js` — metadata sırası, HTTPS şartı, Popüler/Son Haberler render'ı ve fallback sözleşmesini doğrular.

Overlay sırası önemlidir: önce temel Haberler + fallback + kaynak metadata doğrulaması, sonra haber görselleri uygulanmalıdır.

## Production'a taşıma

1. Güncel Play/production kaynak commit'ini kesinleştir.
2. Güncel production commit'inden yeni izole branch aç.
3. Eski test branch'inden `app.js` veya `styles.css` dosyalarını komple kopyalama.
4. `apply-test-news-article-images.mjs` içinde tanımlı davranışı production'ın mevcut Haberler metadata katmanına port et.
5. Mevcut başlık/zaman doğrulama mantığını koru; görsel özelliği bu mantığın üzerine eklenmelidir.
6. Popüler ve Son Haberler kartlarında gerçek görsel + kategori-art fallback'ini cihazda doğrula.
7. Tüm production regresyonlarını çalıştır; yalnız Haberler görseli için mevcut hesap/bildirim/backend davranışları değişmemelidir.

## Kabul kriterleri

- Gerçek makale görseli bulunan haberde görsel kartta görünür.
- Aynı görsel Son Haberler thumbnail'ında kullanılabilir.
- HTTP veya bozuk URL kabul edilmez.
- Görsel bulunamaz/bozulursa kart boş kalmaz; kategori fallback'i görünür.
- Kategori chip'i ve başlık okunabilirliğini korur.
- Main/production kodu test geliştirmesi sırasında değiştirilmez.
