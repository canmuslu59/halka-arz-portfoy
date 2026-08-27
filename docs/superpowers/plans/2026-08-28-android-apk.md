# Halka Arz Portföy Android APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing mobile-first IPO portfolio web app into a standalone Android application that stores portfolio data on-device, refreshes BIST/IPO data over the internet, and produces an installable APK without a Node.js server.

**Architecture:** Keep the existing HTML/CSS UI inside an Android WebView and replace `/api/*` calls with a focused local JavaScript application layer. A small native Android bridge provides atomic SharedPreferences persistence and CORS-free HTTPS requests; domain calculations and parsers remain testable ES modules shared by the WebView app. Android owns only storage/network plumbing, while portfolio behavior stays in JavaScript.

**Tech Stack:** HTML/CSS/ES modules, Node.js 22 built-in `node:test`, Android WebView, Java 17, Android SharedPreferences, `HttpURLConnection`, Gradle Android application plugin.

**Spec:** `docs/superpowers/specs/2026-08-28-android-apk-design.md`

## Global Constraints

- Android APK must run without the Node.js `server.js` process.
- Target mobile widths include 360–430 px and Samsung Galaxy S22 Ultra class screens.
- Portfolio data is stored only on the device in the first release.
- No broker integration, order placement, account system, push notifications, or real-time data guarantee.
- Invalid tickers, non-positive lot counts, and sales above current lots must be rejected.
- Offline start must display the last successful saved market/IPO snapshot.
- Existing portfolio formulas from the approved spec are authoritative.

---

### Task 1: Extract and test the domain model

**Files:**
- Create: `public/core/domain.js`
- Create: `test/domain.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `cleanTicker(value)`, `profitPct(profit, cost)`, `calculateHolding(holding)`, `calculateTotals(holdings)`, `makePortfolioHistory(holdings)`, `validateSale(holding, lots, price)`.
- Consumes: plain holding objects with IPO, market snapshot, sales, and history fields.

- [ ] **Step 1: Add a test command and write failing domain tests**

`package.json` must contain `"test": "node --test test/*.test.js"`.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTicker, calculateHolding, validateSale } from '../public/core/domain.js';

test('cleanTicker normalizes BIST suffixes and punctuation', () => {
  assert.equal(cleanTicker(' kpeks.IS '), 'KPEKS');
  assert.equal(cleanTicker('abc.e'), 'ABC');
});

test('calculateHolding separates realized and unrealized profit', () => {
  const result = calculateHolding({
    ticker: 'TEST', initialLots: 10, currentLots: 6,
    ipoPrice: 10, currentPrice: 15, previousClose: 14,
    sales: [{ lots: 4, price: 12 }], history: []
  });
  assert.equal(result.invested, 100);
  assert.equal(result.realizedProfit, 8);
  assert.equal(result.unrealizedProfit, 30);
  assert.equal(result.totalProfit, 38);
  assert.equal(result.dailyProfit, 6);
});

test('validateSale rejects selling more than current lots', () => {
  assert.throws(() => validateSale({ currentLots: 3 }, 4, 20), /mevcut lottan fazla/i);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test`
Expected: FAIL because `public/core/domain.js` does not exist.

- [ ] **Step 3: Implement the minimal pure domain module**

Implement the approved formulas exactly and keep all functions free of browser/Android dependencies. `validateSale` throws Turkish user-facing `Error` messages for invalid lot/price values.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `npm test`
Expected: all domain tests PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json public/core/domain.js test/domain.test.js
git commit -m "feat: extract portfolio domain logic"
```

---

### Task 2: Extract and test market/IPO parsers

**Files:**
- Create: `public/core/parsers.js`
- Create: `test/parsers.test.js`

**Interfaces:**
- Produces: `numTR(value)`, `isoFromTurkishDate(text)`, `parseYahooChart(json, ticker)`, `parseAhlatciList(html, ticker)`, `parseAhlatciDetail(html, base)`.
- Consumes: raw Yahoo chart JSON and raw Ahlatcı HTML strings.

- [ ] **Step 1: Write failing parser tests with embedded fixtures**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYahooChart, parseAhlatciList, parseAhlatciDetail } from '../public/core/parsers.js';

test('parseYahooChart returns current, previous close and history', () => {
  const json = { chart: { result: [{
    meta: { regularMarketPrice: 15, chartPreviousClose: 14, currency: 'TRY', regularMarketTime: 1760000000 },
    timestamp: [1759900000, 1760000000],
    indicators: { quote: [{ close: [14, 15], high: [15,16], low: [13,14], open: [13.5,14.5] }] }
  }] } };
  const out = parseYahooChart(json, 'TEST');
  assert.equal(out.current, 15);
  assert.equal(out.previousClose, 14);
  assert.equal(out.history.length, 2);
});

test('Ahlatcı parsers extract IPO price and first trade date', () => {
  const list = `<table><tr><td>Test AŞ TEST</td><td>x</td><td>94,00 ₺</td><td>18-19 Ağustos 2026</td><td><a href="/halka-arz/test">Detay</a></td></tr></table>`;
  const base = parseAhlatciList(list, 'TEST');
  assert.equal(base.ipoPrice, 94);
  const detail = parseAhlatciDetail(`<h1>Test AŞ</h1><div>Halka Arz Fiyatı 94,00 ₺ İlk İşlem Tarihi: 21 Ağustos 2026</div>`, base);
  assert.equal(detail.firstTradeDate, '2026-08-21');
});
```

- [ ] **Step 2: Run parser tests and verify RED**

Run: `node --test test/parsers.test.js`
Expected: FAIL because parser module does not exist.

- [ ] **Step 3: Implement parser functions ported from `server.js`**

`parseYahooChart` must throw `Error('Fiyat verisi bulunamadı.')` when chart result is absent. Ahlatcı parsers must return `null` when ticker is not present and must preserve `source: 'Ahlatcı Yatırım'`.

- [ ] **Step 4: Run full tests and verify GREEN**

Run: `npm test`
Expected: domain and parser tests PASS.

- [ ] **Step 5: Commit**

```bash
git add public/core/parsers.js test/parsers.test.js
git commit -m "feat: add market and IPO parsers"
```

---

### Task 3: Add local repository and portable HTTP adapter

**Files:**
- Create: `public/core/repository.js`
- Create: `public/core/http.js`
- Create: `test/repository.test.js`

**Interfaces:**
- Produces: `createRepository(storage)`, `httpGetJson(url)`, `httpGetText(url)`.
- Storage contract: `{ get(): Promise<string|null>, set(jsonString): Promise<void> }`.
- Android bridge contract: `window.AndroidBridge.readPortfolio()`, `writePortfolio(json)`, `httpGet(url)` returning JSON envelopes.

- [ ] **Step 1: Write failing repository tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../public/core/repository.js';

test('repository persists holdings and restores them', async () => {
  let raw = null;
  const storage = { get: async () => raw, set: async value => { raw = value; } };
  const repo = createRepository(storage);
  await repo.save({ holdings: [{ id: '1', ticker: 'TEST' }] });
  assert.deepEqual(await repo.load(), { holdings: [{ id: '1', ticker: 'TEST' }] });
});

test('repository returns empty portfolio for corrupt storage', async () => {
  const repo = createRepository({ get: async () => '{bad', set: async () => {} });
  assert.deepEqual(await repo.load(), { holdings: [] });
});
```

- [ ] **Step 2: Run repository tests and verify RED**

Run: `node --test test/repository.test.js`
Expected: FAIL because repository module does not exist.

- [ ] **Step 3: Implement repository and HTTP adapters**

Browser fallback uses `localStorage`; Android uses `window.AndroidBridge`. `httpGetJson`/`httpGetText` prefer the Android bridge when present and fall back to `fetch` for desktop development. HTTP failures must throw readable `Error` objects.

- [ ] **Step 4: Run full tests and verify GREEN**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add public/core/repository.js public/core/http.js test/repository.test.js
git commit -m "feat: add on-device repository adapters"
```

---

### Task 4: Replace server API calls with standalone portfolio service

**Files:**
- Create: `public/core/portfolio-service.js`
- Create: `test/portfolio-service.test.js`
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/sw.js`

**Interfaces:**
- Produces `createPortfolioService({ repository, getMarket, getIpo, now, uuid })` with methods `lookup`, `getPortfolio`, `addHolding`, `updateHolding`, `addSale`, `deleteHolding`, `refreshHolding`.
- UI consumes the service directly; there are no `/api/*` requests in the Android build.

- [ ] **Step 1: Write failing service tests for add/sale/offline fallback**

Tests use deterministic injected `getMarket`, `getIpo`, `now`, and `uuid` functions. Verify duplicate ticker rejection, cached snapshot persistence after a successful refresh, and that a later network failure still returns the cached price with an error warning.

- [ ] **Step 2: Run service tests and verify RED**

Run: `node --test test/portfolio-service.test.js`
Expected: FAIL because service module does not exist.

- [ ] **Step 3: Implement the service with parallel market/IPO refresh**

Market data uses Yahoo chart URL for `${ticker}.IS`; IPO lookup searches Ahlatcı page 1 first then pages 2–12 in parallel, then follows detail URL. Persist fetched IPO/market snapshots on the holding. When refresh fails, preserve the previous snapshot and attach `errors.market`/`errors.ipo` instead of deleting data.

- [ ] **Step 4: Convert `public/app.js` to ES module service calls**

Replace `api()` with service method calls while preserving all existing forms, sheets, chart rendering, 60-second foreground refresh, manual IPO override, sales, delete, and mobile layout. Remove PIN prompts because data is device-local.

- [ ] **Step 5: Update HTML/service worker for module assets**

Load `app.js` with `type="module"` and cache `core/*.js` assets for app-shell offline loading.

- [ ] **Step 6: Run full tests and static checks**

Run: `npm test`
Run: `grep -R "fetch('/api\|/api/" public/app.js public/core || true`
Expected: tests PASS and grep emits no local API dependency.

- [ ] **Step 7: Commit**

```bash
git add public/app.js public/index.html public/sw.js public/core/portfolio-service.js test/portfolio-service.test.js
git commit -m "feat: make portfolio app standalone"
```

---

### Task 5: Add Android WebView host and native bridge

**Files:**
- Create: `android/settings.gradle`
- Create: `android/build.gradle`
- Create: `android/gradle.properties`
- Create: `android/app/build.gradle`
- Create: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/java/com/innative/halkaarz/MainActivity.java`
- Create: `android/app/src/main/res/values/strings.xml`
- Create: `android/app/src/main/res/values/themes.xml`
- Create: `android/app/src/main/res/xml/network_security_config.xml`
- Create/copy: `android/app/src/main/assets/www/**`

**Interfaces:**
- `AndroidBridge.readPortfolio(): String`
- `AndroidBridge.writePortfolio(json: String): void`
- `AndroidBridge.httpGet(url: String): String` where return is `{"ok":true,"status":200,"body":"..."}` or `{"ok":false,"status":0,"error":"..."}`.

- [ ] **Step 1: Add Android project configuration**

Use application id `com.innative.halkaarz`, minSdk 26, compile/target SDK 35, Java 17. Enable Internet permission, disable cleartext traffic, set portrait-friendly responsive WebView without forcing orientation.

- [ ] **Step 2: Implement `MainActivity` bridge**

Configure WebView JavaScript, DOM storage, safe-area viewport, back navigation, and `file:///android_asset/www/index.html`. SharedPreferences key `portfolio_json_v1` stores the entire portfolio string. `httpGet` accepts only `https://` URLs and performs a bounded `HttpURLConnection` GET with 12-second connect/read timeouts and browser-like headers.

- [ ] **Step 3: Copy the tested web app into Android assets**

Copy `public/` contents to `android/app/src/main/assets/www/` while excluding server-only files. Ensure relative asset URLs work under `file:///android_asset`.

- [ ] **Step 4: Add deterministic Android asset sync script**

Create `scripts/sync-android-assets.mjs` that clears and recopies `public/` into the Android assets directory. Add `npm run android:sync`.

- [ ] **Step 5: Run JS tests and asset integrity checks**

Run: `npm test`
Run: `npm run android:sync`
Run: `test -f android/app/src/main/assets/www/index.html && test -f android/app/src/main/assets/www/core/portfolio-service.js`
Expected: all commands succeed.

- [ ] **Step 6: Commit**

```bash
git add android scripts package.json
git commit -m "feat: add standalone Android host"
```

---

### Task 6: Build, verify, and package the APK

**Files:**
- Create: `android/gradlew`, `android/gradlew.bat`, `android/gradle/wrapper/gradle-wrapper.properties`, `android/gradle/wrapper/gradle-wrapper.jar` when Android tooling is available.
- Create output: `dist/halka-arz-portfoy.apk`
- Create output: `dist/halka-arz-portfoy-android-source.zip`
- Modify: `README.md`

**Interfaces:**
- Deliverable APK installs as package `com.innative.halkaarz`.

- [ ] **Step 1: Generate/install required Gradle wrapper and Android SDK components**

Use Gradle 8.11.1, Android Gradle Plugin 8.7.3, platform `android-35`, and build-tools `35.0.0`. Set `ANDROID_HOME`/`sdk.dir` to the available SDK location.

- [ ] **Step 2: Build debug APK**

Run: `cd android && ./gradlew --no-daemon assembleDebug`
Expected: `app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 3: Verify APK artifact**

Run: `test -s android/app/build/outputs/apk/debug/app-debug.apk`
Run, when build-tools are available: `apksigner verify --print-certs android/app/build/outputs/apk/debug/app-debug.apk`
Expected: non-empty, valid signed debug APK.

- [ ] **Step 4: Copy deliverables and document installation**

Copy APK to `dist/halka-arz-portfoy.apk`. Create source ZIP excluding `.git`, `.worktrees`, `node_modules`, and Gradle caches. README installation note: transfer APK to S22 Ultra, open it, allow “Install unknown apps” for the file/browser source when Android requests it, then install.

- [ ] **Step 5: Run final verification**

Run: `npm test`
Run: `git status --short`
Expected: tests PASS; only intended distributable files may be untracked before final commit.

- [ ] **Step 6: Commit**

```bash
git add README.md dist android/gradle android/gradlew android/gradlew.bat
git commit -m "build: package Android APK"
```
