# Notification Reliability 28-Part Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all 28 notification reliability gaps identified on 2026-09-11 without touching the release branch until final verification.

**Architecture:** Foreground JS, WorkManager, FCM, and backend are independent producers that converge on canonical semantic identities at `NotificationHelper`. Market alerts require complete/fresh-enough data, IPO alerts require canonical cross-source identities, and remote push must use one data-only delivery path.

**Tech Stack:** Android Java 17, AndroidX WorkManager, SharedPreferences, NotificationCompat, Firebase Messaging, Node.js 22 `node:test`, GitHub Actions, Gradle 8.11.1, Android SDK 36.

**Spec:** `docs/superpowers/specs/2026-09-11-notification-28-fixes-design.md`

## Global Constraints

- Work only on `fix/code25-notification-28-20260911` until final promotion decision.
- Keep `applicationId com.innative.halkaarz`, versionCode 25, versionName 2.4.3 during the fix program.
- One behavior change per RED → GREEN cycle.
- Never advance notification/dedupe state before delivery success is durably established.
- Never claim physical-device PASS without a real device run.
- Each user-visible work cycle must remain within the requested ~25-minute limit.

---

### Task 1: Preserve portfolio threshold level through the Android bridge

**Files:**
- Modify: `test/notification-stability-audit.test.js`
- Modify: `android/app/src/main/java/com/innative/halkaarz/MainActivity.java`

**Interfaces:** foreground `notificationPayloadForEvent()` produces `level`; `AndroidBridge.showLocalNotification()` must pass it unchanged to `NotificationHelper.show()`.

- [ ] **RED:** add a regression asserting `showLocalNotification` reads `parsed.optString("level", "")` and inserts `data.put("level", ...)`; run the focused test and require failure on untouched production code.
- [ ] **GREEN:** copy `level` from JSON into the native data map without changing any other payload field.
- [ ] Run focused test, then full `npm test`.
- [ ] Commit as `fix: preserve portfolio threshold level in native bridge`.

### Task 2: Canonicalize threshold identity across producers

**Files:**
- Modify: `test/android-notification-hardening.test.js`
- Modify: `android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java`

- [ ] **RED:** add a regression proving portfolio identity is normalized numerically so `3`, `3.0`, and equivalent decimal text map to one key rather than raw-string identity.
- [ ] **GREEN:** add a private canonical-level formatter used only for portfolio delivery keys; keep notification body formatting unchanged.
- [ ] Run focused test, then full `npm test`.
- [ ] Commit as `fix: canonicalize portfolio notification identity`.

### Task 3: Require truthful portfolio coverage

**Files:** `backend/alert-engine.js`, `BackgroundAlertWorker.java`, focused market-notification tests.

- [ ] RED tests: incomplete active holding coverage must not emit a `portfolio` event; valid individual ceiling/floor events may still emit.
- [ ] GREEN: track expected valid holdings and gate portfolio aggregation on complete current-session coverage.
- [ ] Focused + full tests; commit.

### Task 4: Intraday tavan/taban touch detection

**Files:** `public/core/parsers.js`, `public/core/notification-rules.js`, `BackgroundAlertWorker.java`, quote-parity tests.

- [ ] RED: candle high touching ceiling and close below ceiling still emits ceiling; low touching floor and close above floor still emits floor.
- [ ] GREEN: expose latest-session high/low extrema and evaluate limit touches against extrema, falling back to current when extrema absent.
- [ ] Focused + full tests; commit.

### Task 5: Sampling blind-spot reduction

**Files:** native quote parser/worker + tests.

- [ ] RED: an earlier current-session candle that touched a limit is detected even when the latest candle did not.
- [ ] GREEN: scan all valid current-session intraday candles for high/low extrema instead of latest tick only.
- [ ] Verify; commit.

### Task 6: Quote age/session freshness

**Files:** worker, backend alert engine/data source contract, tests.

- [ ] RED: same-day but unreasonably stale quote must not drive market/portfolio notifications.
- [ ] GREEN: carry market epoch/age and enforce session-aware freshness window; closed-market behavior must not manufacture new intraday alerts.
- [ ] Verify; commit.

### Task 7: BIST reference/base-price override

**Files:** notification rule inputs, worker quote model, tests.

- [ ] RED: when `referencePrice` is supplied, ceiling/floor calculations use it instead of `previousClose`.
- [ ] GREEN: support explicit reference price; otherwise preserve previous-close fallback.
- [ ] Verify; commit.

### Task 8: Native Gedik parser parity

**Files:** `IpoCalendarParser.java`, `public/core/gedik-calendar.js`, parser tests.

- [ ] RED fixture: foreground-recognized row without literal `AKTİF` must also be recognized natively where valid.
- [ ] GREEN: align the native pattern/normalization with JS semantics.
- [ ] Verify; commit.

### Task 9: Field-wise native IPO merge

**Files:** `BackgroundAlertWorker.java`, IPO regression tests.

- [ ] RED: Gedik same-ticker entry with missing dates must retain Ahlatcı dates.
- [ ] GREEN: merge non-empty Gedik fields over Ahlatcı fallback instead of replacing the whole entry.
- [ ] Verify; commit.

### Task 10: Calendar semantic validation

**Files:** IPO parsers/worker/data sources, tests.

- [ ] RED: anti-bot/structurally unexpected HTTP-200 body is source failure, not valid empty calendar.
- [ ] GREEN: parser result includes/uses structural confidence validation before accepting empty.
- [ ] Verify; commit.

### Task 11: First-baseline miss window

**Files:** worker IPO state schema, tests.

- [ ] RED: a newly appearing offering between installation and first complete baseline must remain eligible for notification.
- [ ] GREEN: persist baseline/install observation metadata and seed only entries demonstrably pre-existing the baseline window; otherwise defer/notify conservatively without replaying the full archive.
- [ ] Verify; commit.

### Task 12: One canonical IPO event identity

**Files:** `NotificationHelper.java`, worker, backend service, tests.

- [ ] RED: meaningful same-day offering update gets a distinct canonical event id while duplicate producer wording does not.
- [ ] GREEN: pass canonical `eventId` through every producer and key final delivery on `ipo|eventId`.
- [ ] Verify; commit.

### Task 13: Canonical IPO date ranges

**Files:** Java/JS canonicalization helpers + tests.

- [ ] RED: `9 – 11 Eylül 2026`, `9-11 Eylül 2026`, and equivalent whitespace normalize identically.
- [ ] GREEN: shared-equivalent canonicalization algorithms in Java/JS/backend.
- [ ] Verify; commit.

### Task 14: Corrupt dedupe-state recovery

**Files:** `NotificationHelper.java`, worker state readers, tests.

- [ ] RED: corrupt state is not silently interpreted as “nothing delivered”.
- [ ] GREEN: quarantine corrupt payload and use conservative recovery marker/state rather than blind replay.
- [ ] Verify; commit.

### Task 15: Durable state write result

**Files:** `NotificationHelper.java`, tests.

- [ ] RED: failed `SharedPreferences.commit()` must make `show()` report failure.
- [ ] GREEN: check commit boolean and return false when durable guard persistence fails.
- [ ] Verify; commit.

### Task 16: Collision-resistant notification IDs

**Files:** `NotificationHelper.java`, tests.

- [ ] RED: two distinct delivery keys with known Java hash collision cannot overwrite each other.
- [ ] GREEN: maintain a persisted deliveryKey→notificationId mapping with collision probing or stable wider digest truncation plus collision check.
- [ ] Verify; commit.

### Task 17: Cold-start notification routing

**Files:** `public/app.js`, `MainActivity.java` only if needed, navigation tests.

- [ ] RED: stock route arriving before portfolio hydration opens correct detail after hydration.
- [ ] GREEN: queue route until portfolio readiness; remove fixed 120ms race.
- [ ] Verify; commit.

### Task 18: Real notification availability in settings

**Files:** `MainActivity.java`, `NotificationHelper.java`, `public/app.js`, settings tests.

- [ ] RED: runtime permission granted but app/channel disabled reports disabled, not `granted`.
- [ ] GREEN: expose app-level and relevant-channel availability status to JS.
- [ ] Verify; commit.

### Task 19: Bounded parallel native quote fetching

**Files:** worker + tests/compile verification.

- [ ] RED/contract: quote fetches are not serialized one-by-one across the whole holdings list and concurrency is bounded.
- [ ] GREEN: bounded executor/futures with per-task timeout/cancellation; preserve deterministic aggregation.
- [ ] Verify Java compile + tests; commit.

### Task 20: Semantic transient retry classification

**Files:** `BackgroundRetryPolicy.java`, worker parser exception types, tests.

- [ ] RED: temporary malformed/empty successful response classified retryable while permanent validation errors remain non-retryable.
- [ ] GREEN: explicit transient-data exception recognized by retry policy.
- [ ] Verify; commit.

### Task 21: Firebase release prerequisite

**Files:** Gradle config/workflow/build tests.

- [ ] RED: production release verification fails when Firebase client config required for push is absent while push is declared enabled.
- [ ] GREEN: define explicit push-enabled build mode/prerequisite; release build either has verified Firebase config or compiles with remote push intentionally disabled and UI/claims reflect that state.
- [ ] Verify; commit.

### Task 22: Wire concrete Node push runtime

**Files:** `server.js`, `backend/service.js`, new sender/runtime module, backend tests.

- [ ] RED: `/v1/installations` registration endpoint and scheduled/check endpoints/runtime hooks are absent.
- [ ] GREEN: instantiate push service, validated registration route, FCM sender abstraction, market/IPO check scheduler entrypoints with safe auth/limits.
- [ ] Verify; commit.

### Task 23: Reliable client registration retry

**Files:** `PushConfigSync.java`, tests.

- [ ] RED: failed registration remains dirty and retries even when token/config are unchanged.
- [ ] GREEN: persist sync-needed state, require 2xx, exponential/bounded retry trigger through WorkManager or explicit background sync worker.
- [ ] Verify; commit.

### Task 24: Data-only FCM contract

**Files:** backend sender/message builder, `PushMessagingService.java`, tests.

- [ ] RED: outbound payload containing top-level notification block is rejected by contract test; title/body must be in data.
- [ ] GREEN: sender emits data-only messages with `kind`, `ticker`, `level/eventId`, `title`, `body`.
- [ ] Verify; commit.

### Task 25: Backend concurrency-safe claims

**Files:** backend store/service, concurrency tests.

- [ ] RED: two overlapping checks can currently send same event twice.
- [ ] GREEN: atomic claim/idempotency token before send with success/failure transition and retry-safe release semantics.
- [ ] Verify; commit.

### Task 26: Backend IPO identity migration

**Files:** backend service, tests.

- [ ] RED: ticker-only state enriched later with dates must not replay same offering.
- [ ] GREEN: migrate/alias old identity to canonical event identity.
- [ ] Verify; commit.

### Task 27: WorkManager best-effort diagnostics

**Files:** worker/scheduler state, JS settings UI, tests.

- [ ] RED: settings cannot distinguish healthy recent background execution from delayed/no execution.
- [ ] GREEN: persist last-start/last-success timestamps and expose “best effort / delayed” status without promising exact 15 minutes.
- [ ] Verify; commit.

### Task 28: Force Stop / OEM battery restriction diagnostics

**Files:** native diagnostics bridge, settings UI, tests.

- [ ] RED: settings provides no platform-restriction diagnostic/guidance.
- [ ] GREEN: surface battery-optimization state where Android API permits and clearly explain Force Stop cannot be bypassed until reopen; no attempt to defeat OS restrictions.
- [ ] Verify; commit.

## Stable checkpoint after every batch

At each multi-task checkpoint run:

```text
npm test
npm run android:sync
# require no asset diff
gradle -p android --no-daemon compileReleaseJavaWithJavac
```

At major checkpoints additionally run `bundleRelease` and verify the AAB exists. Before any completion claim, use fresh CI evidence on the exact application-code SHA.
