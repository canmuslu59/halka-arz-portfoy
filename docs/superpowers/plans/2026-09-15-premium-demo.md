# Full Premium Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully interactive Premium demo APK on the separate test package, with a substantially richer chart/analytics experience, while preserving all currently working production behavior.

**Architecture:** Keep production/business logic isolated. Add new Premium modules under `public/core/` and a dedicated `public/premium-demo.js` renderer/controller. Patch the existing `Gelişmiş` entry point minimally so the demo delegates to the new module; mirror every web asset into Android bundled assets. Build only `com.innative.halkaarz.test` with the existing fixed test signer.

**Tech Stack:** JavaScript ES modules, Canvas 2D, HTML/CSS, Android WebView, Node `node:test`, Gradle/GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-premium-demo-design.md`

## Global Constraints

- Production package `com.innative.halkaarz`, Play signing and live deployment must remain untouched.
- Demo package is `com.innative.halkaarz.test`, version name `2.4.7-premium-demo`, versionCode `30001` or higher if required for install-over.
- Existing Portfolio, Calendar, Add Stock, keyboard IME fix, Settings, Cloudflare and FCM behavior must not be refactored.
- No fake Billing, cloud backup, benchmark, server push or external capability may be shown as working.
- Premium demo is unlocked locally through an isolated entitlement adapter.
- Stock/company logos are presentation-only, with deterministic monogram fallback when a logo cannot be resolved.
- Every new behavioral module follows red → green → regression verification.
- `public/` and `android/app/src/main/assets/www/` must remain byte-for-byte in sync for changed assets.

---

### Task 1: Premium entitlement and analytics core

**Files:**
- Create: `public/core/premium-entitlement.js`
- Create: `public/core/premium-analytics.js`
- Test: `test/premium-entitlement.test.js`
- Test: `test/premium-analytics.test.js`

**Interfaces:**
- Produces: `createPremiumEntitlement({ demo }) -> { hasPremium, mode, label }`
- Produces: `buildPremiumAnalytics({ portfolio, history }) -> analytics`
- Produces: `buildPremiumSeries({ history, metric, range }) -> rows[]`

- [ ] **Step 1: Write failing entitlement tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPremiumEntitlement } from '../public/core/premium-entitlement.js';

test('demo entitlement is explicit and isolated', () => {
  assert.deepEqual(createPremiumEntitlement({ demo:true }), {
    hasPremium:true, mode:'demo', label:'Premium aktif — Demo'
  });
  assert.equal(createPremiumEntitlement({ demo:false }).hasPremium, false);
});
```

- [ ] **Step 2: Run entitlement test and verify RED**

Run: `node --test test/premium-entitlement.test.js`
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement minimal entitlement adapter**

```js
export function createPremiumEntitlement({ demo = false } = {}) {
  return demo
    ? { hasPremium:true, mode:'demo', label:'Premium aktif — Demo' }
    : { hasPremium:false, mode:'free', label:'Ücretsiz' };
}
```

- [ ] **Step 4: Write failing analytics tests** for realized/unrealized/combined P&L, peak/current drawdown, max drawdown, best/worst day, top holding concentration and contribution ranking using small deterministic fixtures.

- [ ] **Step 5: Run analytics tests and verify RED**

Run: `node --test test/premium-analytics.test.js`
Expected: FAIL because analytics exports do not exist.

- [ ] **Step 6: Implement analytics module minimally**

Required return fields:

```js
{
  realizedProfit, unrealizedProfit, totalProfit,
  peakValue, currentDrawdownPct, maxDrawdownPct,
  bestDay, worstDay, topHoldingSharePct, topThreeSharePct,
  holdingContributions, allocationByHolding, allocationBySector
}
```

`buildPremiumSeries` supports `value`, `returnPct`, `profit`, `drawdown` and `7D`, `1M`, `3M`, `1Y`, `ALL` ranges without inventing missing history.

- [ ] **Step 7: Run focused tests GREEN, then existing analytics tests**

Run: `node --test test/premium-entitlement.test.js test/premium-analytics.test.js test/analytics.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add public/core/premium-entitlement.js public/core/premium-analytics.js test/premium-entitlement.test.js test/premium-analytics.test.js
git commit -m "feat: add premium analytics core"
```

---

### Task 2: Premium alerts, watchlist and backup core

**Files:**
- Create: `public/core/premium-alerts.js`
- Create: `public/core/premium-backup.js`
- Create: `public/core/premium-watchlist.js`
- Test: `test/premium-alerts.test.js`
- Test: `test/premium-backup.test.js`
- Test: `test/premium-watchlist.test.js`

**Interfaces:**
- Produces: `validatePremiumRule(rule)`, `createPremiumRuleStore(storage)`, `evaluatePremiumRules(context, rules)`
- Produces: `createBackupPayload(data)`, `parseBackupPayload(text)`
- Produces: `createWatchlistStore(storage)`

- [ ] **Step 1: Write failing alert-rule tests** covering valid/invalid price rules, positive/negative portfolio thresholds, enable/disable, persistence and local evaluation.
- [ ] **Step 2: Run alert tests RED** with `node --test test/premium-alerts.test.js`.
- [ ] **Step 3: Implement minimal alert module** with locally persisted JSON schema `premium_rules_v1`; never alter production notification storage keys.
- [ ] **Step 4: Write failing backup tests** for schema version, round-trip, corrupted JSON rejection and unsupported schema rejection.
- [ ] **Step 5: Run backup tests RED** with `node --test test/premium-backup.test.js`.
- [ ] **Step 6: Implement backup module** using `{ schemaVersion:1, exportedAt, portfolio, settings, premiumRules, watchlist }`; parser throws on invalid structure and never mutates storage itself.
- [ ] **Step 7: Write failing watchlist tests**, run RED, then implement `toggle`, `has`, `all` around storage key `premium_watchlist_v1`.
- [ ] **Step 8: Run all focused tests GREEN and commit.**

---

### Task 3: Premium UI shell, logos and membership value screen

**Files:**
- Create: `public/premium-demo.js`
- Create: `public/core/logo-resolver.js`
- Modify minimally: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Test: `test/premium-demo-ui-contract.test.js`

**Interfaces:**
- Consumes analytics/alerts/backup/watchlist modules from Tasks 1–2.
- Produces: `createPremiumDemoController({ storage, showToast, showLocalNotification, onOpenIpo })` with `render(root, context)`.

- [ ] **Step 1: Write failing UI contract test** asserting the production app imports/initializes the Premium demo controller only behind the test/demo flag and the HTML contains no second navigation system.
- [ ] **Step 2: Run RED** with `node --test test/premium-demo-ui-contract.test.js`.
- [ ] **Step 3: Implement Premium hub renderer** with status hero, portfolio snapshot, insight cards and quick actions for Analytics, Charts, Alerts, IPO Pro, Watchlist, Backup and Membership.
- [ ] **Step 4: Add logo resolver** that prefers a known logo URL only when available and otherwise renders a stable ticker monogram. Image failure must replace itself with the monogram rather than leaving a broken image.
- [ ] **Step 5: Implement membership screen** showing clearly marked demo monthly/yearly example cards, Free vs Premium comparison and CTA `Test sürümünde Premium açık`; no live purchase claims.
- [ ] **Step 6: Run UI contract + navigation regressions GREEN.**
- [ ] **Step 7: Commit.**

---

### Task 4: Advanced interactive chart system

**Files:**
- Create: `public/premium-charts.js`
- Extend: `public/premium-demo.js`
- Extend: `public/styles.css`
- Test: `test/premium-charts.test.js`

**Interfaces:**
- Consumes `buildPremiumSeries`.
- Produces: `createPremiumChart(canvas, options)` with `setMetric`, `setRange`, `setData`, `destroy`.

- [ ] **Step 1: Write failing chart-series tests** for range clipping, value/return/profit/drawdown modes, empty data and min/max point identification.
- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Implement Canvas renderer** with grid, smoothed line/area, zero/reference line, min/max markers, touch crosshair and tooltip model. Keep drawing pure enough for numeric geometry tests.
- [ ] **Step 4: Add Premium chart page** with metric chips `Portföy Değeri`, `Toplam Getiri`, `Kâr/Zarar`, `Drawdown`; range chips `1H`, `1A`, `3A`, `1Y`, `Tümü`; summary row for current/min/max/change.
- [ ] **Step 5: Add secondary charts** for realized vs unrealized P&L, ranked holding contribution and switchable holding/sector allocation. For daily history, render a compact day-by-day P/L strip rather than fabricate a heatmap if dates are sparse.
- [ ] **Step 6: Add benchmark control only when a trustworthy series is actually supplied; otherwise show `BIST 100 karşılaştırması için yeterli veri yok` and keep it disabled.**
- [ ] **Step 7: Run focused chart tests, responsive UI contract tests and existing chart regressions GREEN.**
- [ ] **Step 8: Commit.**

---

### Task 5: Interactive Premium features

**Files:**
- Extend: `public/premium-demo.js`
- Extend: `public/styles.css`
- Test: `test/premium-feature-flows.test.js`

**Interfaces:**
- Smart-alert form uses Task 2 store/validator.
- Backup UI uses Task 2 serializer/parser.
- Watchlist UI uses Task 2 watchlist store.
- IPO Pro delegates to the existing real IPO detail flow through `onOpenIpo(ticker)`.

- [ ] **Step 1: Write failing flow tests** for alert create/edit/toggle/delete, test-notification action, watchlist filtering, export text generation and invalid import protection.
- [ ] **Step 2: Run RED.**
- [ ] **Step 3: Implement Smart Alerts screen** with local-only badge, rule editor, test notification and clear explanation that closed-app server delivery is not part of this test APK.
- [ ] **Step 4: Implement Premium Calendar/watchlist screen** using existing calendar data and local follow state; logo/monogram appears on cards.
- [ ] **Step 5: Implement Backup & Transfer screen** with export payload preview/copy/download bridge when available, import text/file input, validation summary and explicit confirmation before applying imported data.
- [ ] **Step 6: Implement IPO Pro launcher** retaining existing source-aware IPO detail renderer and adding Premium presentation entry cards; do not duplicate/replace its data fetching.
- [ ] **Step 7: Run focused tests GREEN and commit.**

---

### Task 6: Asset mirroring and regression safety

**Files:**
- Mirror all changed/new `public/*` assets to `android/app/src/main/assets/www/*`
- Test: `test/premium-asset-parity.test.js`
- Existing keyboard/add-stock regressions remain unchanged.

- [ ] **Step 1: Write failing parity test** for every Premium asset and `app.js/index.html/styles.css` parity.
- [ ] **Step 2: Run RED before mirroring.**
- [ ] **Step 3: Mirror assets exactly.**
- [ ] **Step 4: Run parity test GREEN.**
- [ ] **Step 5: Run focused safety suite:**

```bash
node --test \
  test/premium-*.test.js \
  test/stock-add-flow-regression.test.js \
  test/background-closed-alert-regression.test.js \
  test/verified-market-reference.test.js \
  test/navigation.test.js
```

- [ ] **Step 6: Run full `npm test`; fix only Premium/demo regressions, never unrelated working behavior.**
- [ ] **Step 7: Commit.**

---

### Task 7: Separate Premium demo APK build and verification

**Files:**
- Create: `.github/workflows/premium-demo-test-apk.yml`
- No production Gradle/package/signing file is permanently changed solely for the demo identity.

**Interfaces:**
- Build workspace applies test-only package suffix/label/version identity.
- Signing uses the same fixed public AOSP test certificate as the existing separate Test app.

- [ ] **Step 1: Add workflow that checks out `feature/premium-demo-20260915`, runs `npm test`, sync-verifies assets, patches build workspace to `com.innative.halkaarz.test`, `2.4.7-premium-demo`, versionCode >= `30001`, label `Halka Arz Portföyüm Test`, then compiles and assembles release APK.**
- [ ] **Step 2: Sign with the pinned AOSP public test signer used by the existing test APK; never use production Play upload key.**
- [ ] **Step 3: Verify package/version/signature using Android build tools and emit SHA-256.**
- [ ] **Step 4: Download artifact and confirm APK exists locally before claiming completion.**
- [ ] **Step 5: Final regression check:** compare branch against `release/v2.4.7-code30`; ensure changes are Premium/demo/docs/workflow only and no Cloudflare/production signing/package files drifted unexpectedly.
