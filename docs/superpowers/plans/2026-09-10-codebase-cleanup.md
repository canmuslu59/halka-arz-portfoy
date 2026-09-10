# Halka Arz Portföyüm Codebase Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flatten the production source, audit the entire application, fix confirmed defects, harden tests and leave a clean release-ready codebase without producing an AAB.

**Architecture:** Apply the historical Code18→22 transforms once, commit their resulting production source, and retire transform-driven production builds. Then audit each subsystem with behavior-first tests, preserving working behavior while fixing concrete correctness, security, lifecycle and maintainability issues.

**Tech Stack:** Node.js 20+, browser ES modules, Android Java/WebView, AndroidX WorkManager, Firebase Messaging, Gradle 8.11.1, Android SDK 36, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-10-codebase-cleanup-design.md`

## Global Constraints

- Production package remains `com.innative.halkaarz`.
- Target SDK remains 36.
- Existing Play upload key is not touched in Phase 1.
- No AAB, APK signing or Play release is produced in Phase 1.
- Existing portfolio data format remains backward compatible unless a migration is explicitly tested.
- Per-stock percentage-rise alerts stay disabled; only ceiling/floor plus portfolio-level threshold alerts remain.

---

### Task 1: Flatten the actual Code22 production source

**Files:**
- Modify/create normal production files under `public/`, `android/app/src/main/`, `test/`.
- Modify: `.github/workflows/android-code22.yml`
- Retain historical `.ci/code*-transform.py` only as archived migration evidence, not as build inputs.

**Interfaces:**
- Consumes: Code18/19 deltas and Code20/21/22 transform scripts.
- Produces: direct checked-in Code22-equivalent production files.

- [ ] Reconstruct Code22 source in CI and run the current regression suite to capture baseline behavior.
- [ ] Commit the reconstructed `public/` and Android native sources directly to the cleanup branch.
- [ ] Change CI so tests operate directly on checked-in source and never apply historical transforms.
- [ ] Re-run the baseline suite; expected behavior must match the pre-flatten reconstruction.
- [ ] Verify `npm run android:sync` produces the same Android web assets from the checked-in `public/` tree.

### Task 2: Normalize and modernize the test suite

**Files:**
- Modify: `test/code19-behavior.test.js`, `test/code21-behavior.test.js`, `test/v236-code18.test.js` as needed.
- Create: `test/navigation-contract.test.js`, `test/notification-contract.test.js`, `test/ipo-background-contract.test.js` if separation improves clarity.

**Interfaces:**
- Consumes: production behavior contracts.
- Produces: version-agnostic tests describing current intended behavior.

- [ ] Identify tests that assert old version numbers or superseded implementation details.
- [ ] Replace those assertions with behavior contracts, keeping explicit regression coverage for every intentionally replaced behavior.
- [ ] Add tests that fail if transform scripts are required to construct production files.
- [ ] Run the full suite and verify all tests pass before changing production behavior further.

### Task 3: Audit and harden Android native shell

**Files:**
- Modify: `android/app/src/main/java/com/innative/halkaarz/MainActivity.java`
- Modify: native notification/worker/config classes now committed by Task 1.
- Test: Android contract tests.

**Interfaces:**
- Consumes: SPA back handler, notification config JSON, allowed network hosts.
- Produces: safe WebView bridge, deterministic back behavior, lifecycle-safe background work.

- [ ] Add failing tests for allowed-host HTTPS enforcement including redirect escape attempts.
- [ ] Implement a strict host allow-list for only required public data endpoints; validate final redirect URLs as well.
- [ ] Add tests for Android back: detail/sheet/tab history first, double-back exit only at root.
- [ ] Review WebView lifecycle, executor shutdown, permission callback and cache-clearing behavior; fix races or null/lifecycle hazards found.
- [ ] Verify notification permission is requested only when required and scheduler is re-synced after permission changes.

### Task 4: Audit notification channels and background jobs

**Files:**
- Modify: `NotificationHelper.java`, `BackgroundAlertScheduler.java`, `BackgroundAlertWorker.java`, `PushConfigSync.java`, `PushMessagingService.java` as present.
- Tests: notification and worker contract tests.

**Interfaces:**
- Consumes: sanitized alert config and current market/IPO data.
- Produces: de-duplicated local notifications using correct channels/sounds.

- [ ] Add tests for channel routing: rise/portfolio, ceiling coin, floor, normal/default and IPO.
- [ ] Ensure Android 8+ immutable channel sound behavior is versioned correctly so updates actually change channel sounds when intended.
- [ ] Add tests for worker scheduling with no holdings; IPO checking must still run.
- [ ] Replace silent worker failures with retry/failure rules based on transient vs permanent errors.
- [ ] Improve IPO de-dup key from ticker-only lifetime suppression to an offering identity/date fingerprint.
- [ ] Verify system notification enablement before expensive background network work where appropriate.

### Task 5: Audit SPA navigation, state and UI event flow

**Files:**
- Modify: `public/app.js`; split into focused modules only where justified.
- Tests: UI/navigation contracts.

**Interfaces:**
- Consumes: service methods and browser history.
- Produces: deterministic UI state and navigation.

- [ ] Add deterministic tests for `navDepth`, popstate, sheet close and native back delegation.
- [ ] Remove duplicate/racing refresh paths and guard against overlapping portfolio/history refreshes.
- [ ] Ensure failed refreshes do not overwrite valid cached UI state or mark stale data as fresh.
- [ ] Audit dynamic HTML insertion; keep escaping for all externally sourced strings.
- [ ] Audit event listeners for repeated registration after rerenders and fix leaks/duplicates.

### Task 6: Audit portfolio domain, persistence and calculations

**Files:**
- Modify: `public/core/portfolio-service.js`, `public/core/domain.js`, `public/core/repository.js`, related tests.

**Interfaces:**
- Consumes: holdings, quotes, IPO metadata, sales and overrides.
- Produces: validated portfolio snapshots and history.

- [ ] Add edge-case tests for zero lots, overselling, invalid dates, invalid prices, missing quote fields, NaN/Infinity and partial source failure.
- [ ] Ensure mutations validate input before persistence and remain atomic from the caller perspective.
- [ ] Verify primary/backup persistence recovery with corrupted primary and corrupted backup cases.
- [ ] Audit history math for sold holdings and first-trade-date boundaries; fix confirmed inconsistencies.
- [ ] Ensure missing values remain distinguishable from true zero in totals/errors.

### Task 7: Audit data sources, parsers and caching

**Files:**
- Modify: `public/core/data-sources.js`, `public/core/http.js`, `public/core/parsers.js`, `public/core/market-calendar.js`, deterministic fixtures/tests.

**Interfaces:**
- Consumes: Yahoo/Ahlatcı/Fibabanka responses.
- Produces: normalized market and IPO records.

- [ ] Create saved HTML fixtures for active/upcoming/archive IPO cards including NETGL-style consortium data.
- [ ] Test active-card, archive-row and detail parsing independently and together.
- [ ] Ensure cache keys include schema/version where parser changes can invalidate old cached results.
- [ ] Audit timeouts, response-size limits and fallback ordering; do not cache permanent empty results for transient network failures.
- [ ] Verify BIST market-date/time behavior around weekends, holidays and Istanbul timezone boundaries.

### Task 8: Audit Node server and PWA/service worker

**Files:**
- Modify: `server.js`, `public/sw.js`, server tests.

**Interfaces:**
- Consumes: HTTP requests and optional `APP_PIN`.
- Produces: local/web server API and static assets.

- [ ] Test static path traversal/decoding edge cases and correct MIME behavior.
- [ ] Review optional PIN comparison, exposure in query parameters and cache headers; remove insecure query-token behavior if not required by current clients.
- [ ] Ensure fetch failures do not become long-lived empty IPO cache entries.
- [ ] Audit service-worker caching so old JS cannot survive a production update unexpectedly.
- [ ] Remove dead desktop/server paths only when tests show they are unused by Android and retaining them adds risk.

### Task 9: Whole-repository hygiene and dead-code pass

**Files:**
- All production/test/config files as needed.

**Interfaces:**
- Produces: maintainable direct source without hidden build-time mutations.

- [ ] Scan for empty `catch {}`, ignored exceptions, duplicate constants, dead version-specific code, stale workflows and temporary files.
- [ ] Replace silent critical failures with explicit handling; leave optional UI-only catches documented.
- [ ] Remove no-op/temp files and obsolete build workflows that can accidentally generate the wrong artifact.
- [ ] Update README to describe the real direct-source Android build and notification/data limitations.

### Task 10: Phase 1 verification and audit report

**Files:**
- Create: `docs/audits/2026-09-10-codebase-audit.md`

**Interfaces:**
- Consumes: all completed cleanup work.
- Produces: verified clean branch ready for Phase 2 release work.

- [ ] Run `npm ci` and full `npm test` from direct source; record exact pass count.
- [ ] Run `npm run android:sync`, then full tests again; record exact pass count.
- [ ] Compile Android release sources without packaging/signing a release AAB; verify Java/Gradle compile tasks succeed.
- [ ] Re-run critical parser/notification/navigation contract tests independently.
- [ ] Write audit report with confirmed fixes, test evidence, remaining external-data risks and deliberately untouched product behavior.
- [ ] Confirm no AAB or signed release artifact was produced during Phase 1.
