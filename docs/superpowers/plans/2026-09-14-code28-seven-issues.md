# Code28 Seven Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the seven code-level defects found in the final review without producing an AAB.

**Architecture:** Keep the current WebView/Android/Cloudflare architecture. Fix behavior at the smallest responsible layer, preserve parity between JavaScript, Android worker, and Cloudflare quote/alert logic, and add focused regression tests before each production change.

**Tech Stack:** JavaScript ES modules, Node test runner, Android Java 17, WorkManager/Firebase Messaging, Cloudflare Workers/Durable Objects.

**Spec:** Findings from the 2026-09-14 code-only review of commit `c5865de8c42a7430edb7d032dce4030aee86e61b`.

## Global Constraints

- Do not build or publish an AAB in this plan.
- Each issue is handled as an independent test-first session.
- Keep existing public behavior unless the issue explicitly requires a behavior change.
- Keep web assets and Android packaged assets synchronized.
- Run the focused regression test first, then the full test suite after implementation.

---

### Task 1: Fair ticker-budget rotation

**Files:**
- Modify: `backend/service.js`
- Test: `test/backend-service-budgets.test.js`

**Interfaces:**
- Consumes: stored push state and `marketCheck({ maxUniqueTickers, maxNotifications })`.
- Produces: a persisted/derived fair rotation so every ticker is eventually checked when the unique ticker count exceeds the per-run budget.

- [ ] Write a failing test with more tickers than the budget and two consecutive checks; assert the second check reaches tickers skipped by the first.
- [ ] Run the focused test and confirm it fails because the same first slice is selected repeatedly.
- [ ] Implement minimal deterministic rotation/cursor behavior without breaking existing alert state.
- [ ] Run focused and full tests.
- [ ] Commit only Task 1 changes.

### Task 2: Reject invalid previous-close fallbacks

**Files:**
- Modify: `public/core/parsers.js`
- Modify: `android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java`
- Sync: `android/app/src/main/assets/www/core/parsers.js`
- Test: `test/parsers.test.js`
- Test: `test/android-notification-quote-parity.test.js`

**Interfaces:**
- Consumes: Yahoo chart metadata/candles.
- Produces: `previousClose` only when a genuine previous-session close can be established; otherwise the quote is incomplete and must not create a daily move.

- [ ] Add failing parser/native contract tests proving latest/current tick cannot stand in for previous close.
- [ ] Run focused tests and verify failure.
- [ ] Remove the current-price fallback and preserve valid previous-session fallbacks.
- [ ] Sync packaged web assets and run focused/full tests.
- [ ] Commit only Task 2 changes.

### Task 3: Enable server-side IPO push checks

**Files:**
- Modify: `cloudflare/worker.js`
- Modify: `cloudflare/durable-store.js`
- Add or reuse an IPO calendar fetch/parser adapter under `cloudflare/` or `backend/`.
- Test: `test/cloudflare-worker.test.js`
- Test: `test/cloudflare-durable-store.test.js`

**Interfaces:**
- Consumes: `createPushService().ipoCheck()` and real IPO calendar source data.
- Produces: periodic server-side IPO push evaluation without replaying already-seen offerings.

- [ ] Add failing tests showing scheduled/alarm execution invokes IPO evaluation with non-empty source data.
- [ ] Run focused tests and verify failure.
- [ ] Wire a real IPO calendar data source and call `ipoCheck()` from both scheduled and Durable Object alarm paths.
- [ ] Run focused/full tests.
- [ ] Commit only Task 3 changes.

### Task 4: Prevent bad FCM tokens from starving later notifications

**Files:**
- Modify: `cloudflare/fcm-sender.js`
- Modify: `backend/service.js`
- Test: `test/cloudflare-fcm-sender.test.js`
- Test: `test/backend-service-budgets.test.js`

**Interfaces:**
- Consumes: FCM send responses.
- Produces: typed permanent-token failure information and registration cleanup; permanent failures must not monopolize the per-run notification budget indefinitely.

- [ ] Add failing tests for an invalid/unregistered FCM token followed by a valid registration.
- [ ] Run focused tests and verify failure.
- [ ] Classify permanent invalid-token responses, remove/disable the affected registration safely, and continue fairly to later registrations.
- [ ] Run focused/full tests.
- [ ] Commit only Task 4 changes.

### Task 5: Make Yahoo previous-close precedence identical

**Files:**
- Modify: `cloudflare/yahoo-quote.js`
- Test: `test/cloudflare-worker.test.js` or a focused Yahoo quote test.

**Interfaces:**
- Consumes: Yahoo `meta.previousClose` and `meta.chartPreviousClose`.
- Produces: the same precedence as the foreground and Android worker: `previousClose` first, then validated alternatives.

- [ ] Add a failing test where the two metadata values differ.
- [ ] Verify the current Cloudflare adapter chooses the wrong field.
- [ ] Change precedence to match the other layers.
- [ ] Run focused/full tests.
- [ ] Commit only Task 5 changes.

### Task 6: Implement secure Play-review access path

**Files:**
- Modify: `public/core/pro-access.js`
- Modify: `public/app.js` only if the existing review UI needs wiring.
- Sync matching Android assets.
- Test: add/update Pro access tests.

**Interfaces:**
- Consumes: a non-secret, time-bounded authorization value suitable for Play review.
- Produces: review access that can actually be granted without embedding a reusable private secret in the client.

- [ ] Add a failing test for the chosen time-bounded review authorization mechanism.
- [ ] Verify `enableReviewAccess()` currently cannot grant access.
- [ ] Implement the smallest secure mechanism compatible with the existing app, rejecting malformed/expired authorization.
- [ ] Sync assets and run focused/full tests.
- [ ] Commit only Task 6 changes.

### Task 7: Align legacy Node server withholding calculations

**Files:**
- Modify: `server.js`
- Test: add/update server regression tests.

**Interfaces:**
- Consumes: sales lots, sale price, IPO cost.
- Produces: realized profit, sales proceeds, total wealth/profit and same-day values using the same 17.5% withholding-on-positive-realized-gain rule as the main app.

- [ ] Add a failing server regression test covering profitable and loss-making sales.
- [ ] Run focused test and verify failure.
- [ ] Apply the shared 17.5% rule to legacy server calculations without taxing unrealized gains or losses.
- [ ] Run focused/full tests.
- [ ] Commit only Task 7 changes.

### Final verification

- [ ] Confirm `public/` and `android/app/src/main/assets/www/` are identical for packaged web assets.
- [ ] Run the complete Node test suite.
- [ ] Run Android Java/release compile checks if available, but do not produce or publish an AAB artifact.
- [ ] Review the final diff against the seven findings and report any remaining device-only verification limits.