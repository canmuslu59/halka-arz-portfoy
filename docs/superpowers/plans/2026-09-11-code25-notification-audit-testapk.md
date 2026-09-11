# Code25 Notification + Audit Fixes Test APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix selected Code25 audit findings, make Android notification failures diagnosable/recoverable, and produce a debug APK with a native end-to-end test-notification button.

**Architecture:** Keep WorkManager + NotificationHelper as the production notification path; add native diagnostics/settings recovery and a debug-only bridge method. Move reusable Pro review/trial authority off exposed JS toward the configured HTTPS backend, make totals completeness explicit, make Ahlatcı pagination adaptive, and update privacy disclosure.

**Tech Stack:** Java 17, Android API 36, AndroidX WorkManager 2.10.1, WebView JS modules, Node test runner, GitHub Actions/Gradle.

**Spec:** `docs/superpowers/specs/2026-09-11-code25-notification-audit-testapk-design.md`

## Global Constraints
- Start from `58a80b922888a83a78613b7e3a3ff3e60f030c50` / v2.4.3 / versionCode 25.
- Do not implement or change Play Billing / disabled Pro purchase flow (finding 3).
- Do not change 2026/2027 holiday logic or add 2028+ holiday dates (finding 6).
- Test notification UI must exist only in debug/test APK, never release/AAB.
- Do not add private signing material or plaintext passwords to the repository.

---

### Task 1: Add regression tests for selected audit findings
**Files:**
- Create: `test/code25-audit-followup.test.js`
- Modify only production files after RED is observed.

**Interfaces:**
- Consumes current `calculateTotals`, Pro access module, Ahlatcı source configuration, privacy copy, Android bridge.
- Produces executable regression contract for Tasks 2-5.

- [ ] Add tests asserting incomplete holdings are surfaced as incomplete totals; no plaintext review access code remains in public JS; review UI is conditional; Ahlatcı is not hard-limited to 12 pages; privacy copy mentions ticker/lot remote sync; debug test-notification bridge is debug-gated; release source has no unconditional test button.
- [ ] Run `npm test -- test/code25-audit-followup.test.js` and confirm expected failures.

### Task 2: Notification diagnostics and debug-only test trigger
**Files:**
- Modify: `android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java`
- Modify: `android/app/src/main/java/com/innative/halkaarz/MainActivity.java`
- Modify: `android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java`
- Modify: `public/app.js`
- Sync generated Android assets via `npm run android:sync`.

**Interfaces:**
- Produces `AndroidBridge.getNotificationStatus() -> JSON`, `AndroidBridge.openNotificationSettings()`, and debug-only `AndroidBridge.showDebugTestNotification()` behavior.

- [ ] Add failing tests for permission/channel/status reporting, reschedule-after-permission flow, and debug-only trigger.
- [ ] Implement native status JSON and settings intent.
- [ ] Reschedule worker after permission grant and config sync, retaining existing 15-minute periodic schedule.
- [ ] Add settings-page test button only when native debug capability reports true; call real `NotificationHelper.show` with a clearly labeled test notification.
- [ ] Run focused notification tests, then full `npm test`.

### Task 3: Pro review/trial exposure hardening without touching purchase flow
**Files:**
- Modify: `public/core/pro-access.js`
- Modify: `public/app.js`
- Modify: `android/app/src/main/java/com/innative/halkaarz/MainActivity.java` or backend client helper as needed.
- Modify backend service/server only for authority endpoints if the configured backend path is used.

**Interfaces:**
- No plaintext reusable review code in public JS.
- Review input is shown only when backend/native capability says review access is available.
- Purchase button behavior remains untouched.

- [ ] Add/verify RED tests proving the code is absent from public assets and review form is conditional.
- [ ] Implement backend/native review validation client contract and server-side validation source using environment configuration rather than checked-in secret.
- [ ] Store trial start server-side keyed by install identity when backend is configured; preserve safe fallback semantics without claiming uninstall-proof behavior when backend is absent.
- [ ] Run focused Pro tests and full tests.

### Task 4: Portfolio total completeness + Ahlatcı adaptive pagination + privacy copy
**Files:**
- Modify: `public/core/domain.js`
- Modify: `public/app.js`
- Modify: `public/core/data-sources.js` and/or IPO service pagination logic.
- Modify: `public/privacy.html`

**Interfaces:**
- `calculateTotals()` returns completeness metadata without breaking existing numeric totals consumers.
- Ahlatcı archive discovery stops on no-new-results/no-next-page and has a high safety cap.

- [ ] Add RED tests for incomplete total metadata and dynamic archive pagination.
- [ ] Implement completeness metadata and UI warning/placeholder so partial value is never presented as a complete total.
- [ ] Replace fixed 12-page archive limit with adaptive discovery.
- [ ] Update privacy disclosure for remote ticker/lot notification configuration.
- [ ] Run focused tests and full tests.

### Task 5: Build and verify test APK
**Files:**
- Modify/create CI workflow only if existing workflow cannot emit debug APK artifact.

**Interfaces:**
- Output installable debug APK with `.test` applicationId suffix.

- [ ] Run `npm ci`, `npm test`, `npm run android:sync`, asset equality check, Java compile, and `assembleDebug`.
- [ ] Verify APK package id ends with `.test`, version name is `2.4.3-test`, and test notification button capability is present only in debug build.
- [ ] Verify release source still has versionCode 25/versionName 2.4.3 and findings 3/6 remain unchanged.
- [ ] Export the APK artifact for user download.
