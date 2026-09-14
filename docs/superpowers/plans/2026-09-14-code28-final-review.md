# Code28 Final Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four review findings, add 17.5% withholding only to realized positive sale gains, preserve Code28 identity, and produce a verified signed Play AAB.

**Architecture:** Keep the existing portfolio/domain model as the source of truth for foreground calculations, then carry enough sale-day facts into native/cloud background alert evaluation so all three paths use the same net daily return. Correct market session boundaries centrally, harden push registration with success-aware retry state, and expose withholding only after a sale exists.

**Tech Stack:** Node.js 22 tests, browser JavaScript, Android Java/WorkManager/FCM, Cloudflare Worker, Gradle 8.11.1 / Android API 36.

**Spec:** User request in the 2026-09-14 review conversation; findings are documented in the immediately preceding code review.

## Global Constraints

- Keep versionName `2.4.6` and versionCode `28` because this candidate has not been uploaded to Play.
- Withholding rate is exactly `17.5%` of positive realized sale gain only; no withholding is shown or deducted from unsold/unrealized profit.
- Daily foreground, Android fallback, and cloud push portfolio percentages must agree after same-day sales.
- Normal BIST session remains active through the official closing phase; half-day boundaries must follow BIST session timing.
- Do not advance notification dedupe state unless notification delivery succeeds.
- Final artifact must use the existing Play upload certificate and pass bundle/signature verification.

---

### Task 1: Realized-profit withholding and daily percentage parity

**Files:**
- Modify: `test/domain.test.js`
- Modify: `public/core/domain.js`
- Modify: `public/app.js`

**Interfaces:**
- Produces `WITHHOLDING_RATE = 0.175`, `withholdingTax`, `grossRealizedProfit`, net `realizedProfit`, net `salesProceeds`, and sale-aware `dailyPct`.
- `dailyPct` is computed from net daily profit divided by previous-close value of the lots held at start of day.

- [ ] Write failing tests for a profitable sale, a loss-making sale, no-sale behavior, and sale-day `dailyPct` parity.
- [ ] Run tests and confirm they fail for missing withholding/sale-aware percentage behavior.
- [ ] Implement the minimal domain calculation changes.
- [ ] Render a withholding tile only when at least one sale exists; never show it for an unsold holding.
- [ ] Run the domain tests and full Node suite.

### Task 2: Background alert parity after same-day sales

**Files:**
- Modify: `test/notification-regression.test.js` or the existing alert parity test file that already covers foreground/backend equality.
- Modify: `public/app.js`
- Modify: `backend/alert-engine.js`
- Modify: `android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java`
- Modify: `android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java`
- Modify Cloudflare registration normalization only if it strips the new holding fields.

**Interfaces:**
- Push/native holding registration includes `lots`, `ipoPrice`, and compact dated sale entries required to reconstruct day-start lots and net sale-day P/L.
- All alert paths compute day base as `previousClose * (currentLots + lotsSoldToday)` and net daily P/L as remaining-lot price move + sale-day price move - withholding triggered by profitable sales.

- [ ] Add failing parity tests where a same-day sale changes the crossed threshold.
- [ ] Confirm existing backend/native logic fails the new test.
- [ ] Extend registration payload normalization without breaking old payloads.
- [ ] Update backend and Android fallback formulas.
- [ ] Run focused alert tests and the full suite.

### Task 3: BIST session boundaries

**Files:**
- Modify: `test/bist-market-calendar.test.js`
- Modify: `public/core/market-calendar.js`

**Interfaces:**
- Normal trading day stays open through `18:10` Istanbul time.
- Half-day trading session closes at the current BIST half-day boundary used by the official schedule.

- [ ] Add failing boundary tests immediately before/at normal close and half-day close.
- [ ] Confirm the old 18:00/13:00 model fails.
- [ ] Replace hour-only close representation with minute-precise timestamps.
- [ ] Run calendar and full tests.

### Task 4: Push registration retry hardening

**Files:**
- Modify: `test/android-push-config-noop.test.js`
- Modify: `android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java`
- Modify: `android/app/src/main/java/com/innative/halkaarz/MainActivity.java` only if startup needs an explicit stale-sync kick.

**Interfaces:**
- Persist a successful-sync fingerprint/time only after HTTP 2xx.
- Duplicate token/config remains a no-op only while an equivalent registration is known to be successfully synced.
- Failed/non-2xx registration remains eligible for a later retry; app startup can re-attempt stale/unsynced registration without mutating user preferences.

- [ ] Add failing source/behavior contract tests for retry-after-failure and 2xx-only success state.
- [ ] Confirm the current early-return implementation fails the tests.
- [ ] Implement success-aware fingerprint and retry behavior with bounded scheduling/backoff through the existing executor/WorkManager mechanisms.
- [ ] Run Android contract tests and full suite.

### Task 5: Release verification and signed AAB

**Files:**
- Add/modify a branch-scoped GitHub Actions workflow only as needed for CI and signed packaging.
- No production version bump.

**Interfaces:**
- Output `halka-arz-portfoyum-v2.4.6-code28-play.aab` signed by the existing expected upload certificate SHA-256 `02d9f298a56b63ec9067b911fc898907b6fdfc4e059143d88f0b9df24022a272`.

- [ ] Run the complete Node regression suite.
- [ ] Sync `public` into Android assets and require a clean diff.
- [ ] Compile release Java and build `bundleRelease` with Firebase and push backend configuration.
- [ ] Run `prepare-code28-release.py` with existing repository secrets.
- [ ] Verify JAR signature, expected certificate fingerprint, package/version identity, and SHA-256.
- [ ] Download the final artifact and provide it to the user.
