# Portföy Uygulaması Navigasyon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Test APK içinde alt navigasyonu `Performans — Piyasalar — Cüzdan — Gelişmiş — Ayarlar` yapısına dönüştürmek; ana ekranı Cüzdan + kapsamlı Karşılaştırma olarak bırakmak; mevcut analitikleri Performans'a, Halka Arz Takvimi'ni Piyasalar'a taşımak.

**Architecture:** Mevcut production/public kaynaklarını değiştirmeden Android test asset'lerine uygulanan üçüncü izole overlay kullanılacak. Önceki `apply-test-share-ui.mjs` ve `apply-test-wallet-metrics-nav.mjs` aynen korunacak; yeni `apply-test-portfolio-app-navigation.mjs` onların çıktısı üzerinde yalnız ekran yerleşimi, test-only navigasyon ve karşılaştırma görünümünü dönüştürecek.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Node.js test runner, Android WebView, GitHub Actions, Gradle, AOSP public test key.

**Spec:** `docs/superpowers/specs/2026-09-16-portfolio-app-navigation-design.md`

## Global Constraints

- Main/canlı branch'e dokunma.
- Paket `com.innative.halkaarz.test` olarak kalmalı.
- Önceki AOSP test signer korunmalı.
- Hesaplama, bildirim, hisse ekleme/satış, depolama, backend ve PNG paylaşım mantığı değişmemeli.
- Takip Listesi bu planda yok.
- Hisselerim listesi Cüzdan görünümünde kalmalı.
- Mevcut Halka Arz Takvimi ID'leri ve işlevleri korunmalı.

---

### Task 1: Yeni test sözleşmesini RED'e al

**Files:**
- Create: `test/portfolio-app-navigation-overlay.test.js`
- Modify: `.github/workflows/code29-separate-test-apk.yml`

**Steps:**
1. Yeni testte üçüncü overlay mevcut değilse boş metin kullan ve şu beklentileri tanımla: `performanceView`, `marketsView`, Performans/Piyasalar nav butonları, merkez Cüzdan, günlük/haftalık/aylık karşılaştırma kontrolleri, piyasa özeti, korunmuş calendar ID'leri, Watchlist yokluğu, PNG paylaşımının korunması.
2. Workflow push branch listesine `feature/test-portfolio-app-navigation-20260916` ekle.
3. Yalnız test + workflow trigger commitini çalıştır ve yeni testin beklenen sebeplerle FAIL olduğunu doğrula.

### Task 2: Üçüncü test-only overlay ile ekran yapısını dönüştür

**Files:**
- Create: `scripts/apply-test-portfolio-app-navigation.mjs`
- Modify: `.github/workflows/code29-separate-test-apk.yml`

**Steps:**
1. Önceki overlay sonrası oluşan `portfolioView` içinden mevcut `chart-card`, `dailyHistory`, `sectorAllocation` bloklarını yeni `performanceView` içine taşı.
2. Hisselerim listesini Cüzdan/`portfolioView` altında bırak.
3. Mevcut `calendarView` içeriğini `marketsView` içine taşı; üstüne BIST 100 / Altın (TL) / Dolar piyasa özeti ekle. `calendarRefreshBtn`, `calendarStatus`, `calendarFilter`, `calendarList` ID'lerini değiştirme.
4. Alt navı tam olarak Performans / Piyasalar / Cüzdan / Gelişmiş / Ayarlar yap. Eski Portföy ve Takvim alt-nav düğmelerini kaldır.
5. Android asset `app.js` içinde VIEW_META'ya `performance` ve `markets` ekle; takvim odaklı navigasyon çağrılarını Markets görünümüne yönlendir. Cüzdan `portfolio` root olarak kalsın.
6. Performans görünümü açıldığında mevcut chart canvas görünür olduktan sonra `drawChart` çağrısını tetikle; Piyasalar açıldığında mevcut `loadIpoCalendar()` ve karşılaştırma/piyasa özeti verisini yükle.
7. `addFab` yalnız portfolio/Cüzdan görünümünde kalsın; mevcut davranışı koru.
8. Workflow'a üçüncü overlay çalıştırma ve asset-level grep kontrolleri ekle.
9. Yeni odaklı testi ve tam `npm test` zincirini GREEN doğrula.

### Task 3: Karşılaştırmayı Günlük / Haftalık / Aylık hale getir

**Files:**
- Modify: `scripts/apply-test-portfolio-app-navigation.mjs`
- Test: `test/portfolio-app-navigation-overlay.test.js`

**Steps:**
1. `comparisonCard` içindeki açıklama/status/summary metinlerini kaldır; yalnız `KARŞILAŞTIRMA`, dönem düğmeleri ve dört referans satırı kalsın.
2. `Günlük`, `Haftalık`, `Aylık` segmented kontrolü ekle.
3. Yahoo referansları için dönem bazlı değişimi yalnız gösterim amacıyla hesapla: günlük yaklaşık 1 seans, haftalık yaklaşık 5 seans, aylık yaklaşık 22 seans.
4. Portföy dönem değerini mevcut `state.chartRows` / mevcut portföy geçmişi verisinden türet; veri yetersizse `—` göster. Yeni portföy hesaplama kaynağı yazma.
5. Piyasa özeti günlük referans değerlerini kullanmaya devam etsin.
6. Testleri GREEN doğrula.

### Task 4: Taşınabilir canlıya geçiş kaydı bırak

**Files:**
- Create: `changes/portfolio-app-navigation-20260916/README.md`

**Steps:**
1. Overlay sırasını, taşınacak HTML/CSS/JS bölümlerini, korunan ID sözleşmelerini ve canlıya kör merge yapılmaması gerektiğini yaz.
2. Takip Listesi'nin bu değişiklik paketine dahil olmadığını belirt.
3. Main/canlı branch'in değişmediğini doğrula.

### Task 5: Son APK build ve bağımsız doğrulama

**Files:**
- Modify as needed only: `.github/workflows/code29-separate-test-apk.yml`

**Steps:**
1. Son committe odaklı testleri ve tam `npm test` çalıştır.
2. Android asset sync + üç overlay + `node --check` doğrula.
3. `compileReleaseJavaWithJavac` ve `assembleRelease` çalıştır.
4. AOSP pinned test key ile imzala ve signer SHA-256'nın `a40da80a59d170caa950cf15c18c454d47a39b26989d8b640ecd745ba71bf5dc` olduğunu doğrula.
5. APK içinde `performanceView`, `marketsView`, üç comparison range, piyasa özeti, calendar ID'leri, merkez Cüzdan ve PNG paylaşım köprüsünü doğrula; Watchlist bulunmamalı.
6. Artifact'i indir; `/mnt/data` altında gerçek APK oluştur; SHA-256 ve package/versionCode/versionName bilgilerini yeniden kontrol et.
7. Kullanıcıya yalnız doğrulanmış APK linkini ver; main/live'ın değişmediğini belirt.
