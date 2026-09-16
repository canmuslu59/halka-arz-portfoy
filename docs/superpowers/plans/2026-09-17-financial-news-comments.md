# Financial News + Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the test app's Piyasalar tab with finance-only news, shared comments, and breaking-only notifications without touching production behavior.

**Architecture:** A separate Cloudflare test worker normalizes finance sources and stores comments/breaking state in its own Durable Object. The existing test navigation overlay injects the Haberler UI. The separate `.test` APK uses background polling for breaking-news notifications because Firebase is not configured for the test package; the API contract remains push-ready for production.

**Tech Stack:** Node.js 22, Cloudflare Workers + Durable Objects, vanilla JS web UI, Android Java/WorkManager, Node test runner, Gradle Android build.

**Spec:** `docs/superpowers/specs/2026-09-17-financial-news-comments-design.md`

## Global Constraints

- Work only on `feature/test-portfolio-app-navigation-20260916`; never update `main`.
- Production package `com.innative.halkaarz` behavior must remain unchanged.
- Test package stays `com.innative.halkaarz.test`.
- Existing portfolio calculations, repeated-purchase behavior, notifications, stock add flow, sharing, and data compatibility must remain green.
- News must be finance-only.
- Only source-designated Bloomberg HT `/sondakika` items are `breaking:true` in v1.
- Comment username limit: 2-24 visible characters.
- Comment body limit: 1-400 characters.
- Comment cooldown: 20 seconds per install; exact duplicate on the same news/install is rejected for five minutes.
- Test worker name: `halka-arz-portfoy-news-test`.
- Test worker URL: `https://halka-arz-portfoy-news-test.grass-airboat.workers.dev`.

---

### Task 1: News parser and normalization core

**Files:**
- Create: `cloudflare/news-sources.js`
- Create: `test/news-sources.test.js`
- Create: `test/fixtures/bloomberght-latest.html`
- Create: `test/fixtures/bloomberght-breaking.html`
- Create: `test/fixtures/tcmb-press-rss.xml`

**Interfaces:**
- Produces `parseBloombergLatest(html, now)`, `parseBloombergBreaking(html, now)`, `parseTcmbRss(xml, now)`, `classifyNews(title)`, `normalizeNewsItems(groups)`.
- Normalized items use `{id,source,category,title,summary,url,publishedAt,breaking}`.

- [ ] **Step 1:** Add fixture-driven failing tests proving finance-only parsing, deterministic category classification, stable ids, newest-first sorting, cross-source dedupe, and breaking only for the breaking fixture.
- [ ] **Step 2:** Run `node --test test/news-sources.test.js` and confirm failures are caused by missing implementation.
- [ ] **Step 3:** Implement parsers with source-specific extraction and HTML/XML entity stripping; no full article body storage.
- [ ] **Step 4:** Run `node --test test/news-sources.test.js`; expect all tests PASS.
- [ ] **Step 5:** Commit `feat: add financial news source normalization`.

### Task 2: Isolated news state, comments, and worker routes

**Files:**
- Create: `cloudflare/news-store.js`
- Create: `cloudflare/news-worker.js`
- Create: `wrangler-news-test.jsonc`
- Create: `test/news-worker.test.js`
- Create: `test/news-store.test.js`

**Interfaces:**
- `NewsStateDurableObject` stores `commentsByNews`, per-install rate metadata, cached news, breaking seen ids, and optional news installations.
- Routes: `GET /v1/news`, `GET /v1/news/:id/comments`, `POST /v1/news/:id/comments`, `POST /v1/news/installations`, `GET /api/health`.

- [ ] **Step 1:** Write failing store tests for comment validation, 20s cooldown, 5m duplicate rejection, public-comment privacy, and breaking seen-set persistence.
- [ ] **Step 2:** Write failing worker tests for all routes, partial source failure, finance category filtering, and safe JSON body limits.
- [ ] **Step 3:** Implement `news-store.js` and `news-worker.js` with dependency injection for fetch/clock to keep tests deterministic.
- [ ] **Step 4:** Add `wrangler-news-test.jsonc` with worker name `halka-arz-portfoy-news-test` and a distinct `NEWS_STATE` Durable Object binding/class.
- [ ] **Step 5:** Run `node --test test/news-store.test.js test/news-worker.test.js`; expect PASS.
- [ ] **Step 6:** Commit `feat: add isolated news comments worker`.

### Task 3: Haberler test overlay

**Files:**
- Create: `scripts/apply-test-financial-news.mjs`
- Modify: `scripts/apply-test-portfolio-app-navigation.mjs`
- Create: `test/financial-news-overlay.test.js`

**Interfaces:**
- Overlay runs after existing navigation/stock-entry overlays.
- Internal route may stay `markets`; visible label/title becomes `Haberler`.
- UI calls `NEWS_BACKEND_URL` injected into test assets.

- [ ] **Step 1:** Write failing overlay tests proving `Piyasalar` visible copy is gone, `Haberler` exists, filters exist, old `marketSummary` and IPO calendar blocks are absent from the Haberler view, news cards support source link/comment count, and username/comment inputs exist.
- [ ] **Step 2:** Run `node --test test/financial-news-overlay.test.js`; confirm RED.
- [ ] **Step 3:** Implement isolated overlay HTML/CSS/JS: loading state, refresh, category filtering, external source open, expandable comments, remembered username, safe text rendering, comment POST, and retry states.
- [ ] **Step 4:** Import the overlay last from `apply-test-portfolio-app-navigation.mjs`.
- [ ] **Step 5:** Run overlay tests plus existing navigation/stock tests; expect PASS.
- [ ] **Step 6:** Commit `feat: replace test markets tab with financial news`.

### Task 4: Android test breaking-news fallback

**Files:**
- Create: `android/app/src/main/java/com/innative/halkaarz/FinancialNewsAlertRules.java`
- Modify: `android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java`
- Modify: `android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java`
- Modify: `android/app/build.gradle`
- Create: `test/android-financial-news-notification.test.js`

**Interfaces:**
- BuildConfig `NEWS_BACKEND_URL` is empty by default and injected only in the test APK workflow.
- Background worker fetches `/v1/news?breaking=1` only when `NEWS_BACKEND_URL` is non-empty.
- Device stores notified news ids; only unseen `breaking:true` items produce a `financial_breaking` local notification.

- [ ] **Step 1:** Add failing contract tests proving empty default backend is inert, unseen-id dedupe, non-breaking suppression, and existing portfolio notification methods remain present.
- [ ] **Step 2:** Implement minimal rules and background fetch integration behind `NEWS_BACKEND_URL`.
- [ ] **Step 3:** Add a dedicated notification channel/type for breaking finance news without changing current channels.
- [ ] **Step 4:** Run focused Android notification tests; expect PASS.
- [ ] **Step 5:** Commit `feat: add test breaking financial news alerts`.

### Task 5: Test worker deploy and APK CI integration

**Files:**
- Create: `.github/workflows/deploy-news-test-worker.yml`
- Modify: `.github/workflows/code29-separate-test-apk.yml`

**Interfaces:**
- News deploy workflow uses existing Cloudflare account/token repository secrets and `wrangler-news-test.jsonc`; it never deploys `wrangler.jsonc`.
- APK workflow sets `NEWS_BACKEND_URL=https://halka-arz-portfoy-news-test.grass-airboat.workers.dev` and verifies Haberler markers in the built APK.

- [ ] **Step 1:** Add workflow tests/grep contracts or static test assertions proving the deploy config names only the test news worker.
- [ ] **Step 2:** Create deploy workflow with credentials check, focused news tests, `wrangler deploy --config wrangler-news-test.jsonc`, and `/api/health` verification.
- [ ] **Step 3:** Update test APK workflow focused tests, env, Haberler asset greps, removal of old Piyasalar/market-summary greps, and final backend marker checks.
- [ ] **Step 4:** Push and inspect both workflow runs; fix only feature-related failures.
- [ ] **Step 5:** Commit `ci: deploy news test worker and verify news apk`.

### Task 6: Full verification and artifact

**Files:**
- No new product files unless verification exposes a regression.

**Interfaces:**
- Final output is a signed `.test` APK plus build verification files.

- [ ] **Step 1:** Run `npm test`; expect complete suite PASS.
- [ ] **Step 2:** Verify Android asset sync and overlay application; run `node --check android/app/src/main/assets/www/app.js` after overlays.
- [ ] **Step 3:** Verify test news worker `/api/health` and `GET /v1/news` return usable JSON.
- [ ] **Step 4:** Verify APK CI: Java compile, release assemble, AOSP test signing, package `com.innative.halkaarz.test`, version increment, news worker URL marker, Haberler/comment markers, signature digest, and SHA256.
- [ ] **Step 5:** Download artifact, unzip-test it locally, verify SHA and embedded asset markers, then provide the direct APK link.
