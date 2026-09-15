# Premium Fullscreen Test APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the already functional Premium demo into a full-screen Premium Test experience with a visible main-app entry and produce a verified `com.innative.halkaarz.premiumtest` APK without altering working production/test behavior.

**Architecture:** Keep all existing `premium-*` functional modules and only change the Premium presentation/integration boundary. Add a fixed overlay shell in `index.html`, route the normal Premium entry and the existing `Gelişmiş` compatibility entry into it from `app.js`, refine `premium-demo.js/css` for the requested spacious landing and allocation donut, then mirror assets and build through the isolated Premium APK workflow.

**Tech Stack:** JavaScript ES modules, HTML/CSS, Canvas 2D, Android WebView, Node `node:test`, Gradle/GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-16-premium-fullscreen-design.md`

## Global Constraints

- Production `com.innative.halkaarz` and existing Test `com.innative.halkaarz.test` must not be changed.
- Premium Test package must be `com.innative.halkaarz.premiumtest` with label `Halka Arz Premium Test`.
- Existing Portfolio, stock-add, Samsung/IME handling, notification engine, Calendar and Cloudflare behavior must not be refactored.
- No fake billing, server push, benchmark or cloud backup capability may be presented as working.
- One CI/build cycle must have a timeout below 25 minutes.
- New behavior is test-first and every changed `public/` asset is mirrored exactly into Android bundled assets.

---

### Task 1: Lock the fullscreen integration contract

**Files:**
- Create: `test/premium-fullscreen-shell.test.js`

**Interfaces:**
- Requires DOM IDs `premiumEntry`, `premiumOverlay`, `premiumOverlayContent`, `premiumOverlayClose`.
- Requires app integration functions `openPremiumLayer` and `closePremiumLayer`.

- [ ] Write a Node contract test that reads `public/index.html`, `public/app.js`, `public/premium-demo.js`, `public/premium-demo.css` and `.github/workflows/premium-demo-test-apk.yml`.
- [ ] Assert the Premium main entry and overlay IDs exist, the overlay CSS is fixed/inset/full-viewport with a high z-index, app code exposes open/close integration, landing copy contains `Premium’u Keşfet` plus all six primary cards, membership copy contains `₺49,99`, `₺299,99`, `%40 avantaj`, and workflow identity contains `.premiumtest` / `Halka Arz Premium Test` with timeout `< 25`.
- [ ] Push only this test and observe Premium Demo CI fail for missing fullscreen requirements (RED).

---

### Task 2: Add the isolated full-screen Premium shell

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/premium-demo.css`

**Interfaces:**
- `openPremiumLayer({ selectedTicker } = {})` renders the existing Premium controller into `#premiumOverlayContent` and shows `#premiumOverlay`.
- `closePremiumLayer()` hides the overlay and destroys the Premium controller rendering state without touching portfolio data.

- [ ] Add a compact `Premium’u Keşfet` entry card/button to the normal Portfolio view.
- [ ] Add a fixed hidden overlay after main app content with close control and `#premiumOverlayContent`.
- [ ] Implement open/close functions and listeners; keep normal nav DOM and state intact.
- [ ] Route the existing Premium/Gelişmiş compatibility entry to `openPremiumLayer()` in Premium demo mode.
- [ ] Make browser/Android back close Premium first.
- [ ] Run Premium focused CI; require fullscreen contract to turn GREEN before proceeding.

---

### Task 3: Refine Premium landing and allocation visualization

**Files:**
- Modify: `public/premium-demo.js`
- Modify: `public/premium-demo.css`
- Extend: `test/premium-demo-ui-contract.test.js`

**Interfaces:**
- Existing controller section IDs and functional stores remain unchanged.
- New allocation donut is presentation-only and consumes `analytics.allocationByHolding`.

- [ ] Add failing UI assertions for the six landing cards, stock-chip row and allocation donut marker.
- [ ] Update `renderHome()` with `Premium’u Keşfet`, required explanatory copy, stock chips ASELS/THYAO/TUPRS/BIMAS/KCHOL and the six large feature cards; preserve real portfolio metrics/insights below.
- [ ] Add a CSS `conic-gradient` allocation donut built from real holding weights, with a central total-value label and readable legend; show the existing unavailable state when no holdings exist.
- [ ] Change membership demo prices to `₺49,99 / ay`, `₺299,99 / yıl`, `%40 avantaj` and CTA `Premium Test Aktif`.
- [ ] Run focused Premium tests GREEN.

---

### Task 4: Mirror assets and run regressions

**Files:**
- Mirror changed `public/index.html`, `public/app.js`, `public/premium-demo.js`, `public/premium-demo.css` into `android/app/src/main/assets/www/`.

**Interfaces:**
- Public and Android web assets remain byte-for-byte identical.

- [ ] Run asset sync/mirroring.
- [ ] Run `test/premium-*.test.js`, stock-add, keyboard/lifecycle, notification, verified-market-reference and navigation safety tests.
- [ ] Run full `npm test` and fix only regressions caused by this Premium delta.
- [ ] Confirm no production Cloudflare or signing source changed.

---

### Task 5: Build and verify the final Premium Test APK

**Files:**
- Modify: `.github/workflows/premium-demo-test-apk.yml`

**Interfaces:**
- Build workspace release identity: `applicationIdSuffix '.premiumtest'`, label `Halka Arz Premium Test`, demo version suffix, pinned AOSP test signer.

- [ ] Set workflow timeout to `24` minutes and broaden push paths to the Premium integration/test/assets so final code changes trigger a build automatically.
- [ ] Run full tests, parity, Java compile and release APK assembly in GitHub Actions.
- [ ] Sign APK with the pinned AOSP test key and verify v1/v2/v3 signature, package `com.innative.halkaarz.premiumtest`, label, version, ZIP integrity and SHA-256.
- [ ] Download the successful workflow artifact, extract the APK into `/mnt/data`, independently inspect the artifact files and only then provide the APK to the user.
