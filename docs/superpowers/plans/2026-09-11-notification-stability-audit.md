# Notification Stability Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit every notification-related path in Code25 line-by-line, add missing regression coverage first, fix only proven defects, and repeat end-to-end verification before declaring the notification subsystem stable.

**Architecture:** Treat foreground and native-background alerts as two producers that share notification permission, Android channel delivery, threshold/limit rules, network quote parsing, WorkManager scheduling, and dedupe/retry semantics. Audit each boundary independently, then compare the foreground JavaScript path with the native worker for behavioral parity. Every production change requires a failing regression test first.

**Tech Stack:** Android Java, AndroidX WorkManager, SharedPreferences, NotificationCompat, WebView JavaScript bridge, Node.js `node:test`, GitHub Actions/Gradle.

**Spec:** User request in the current conversation: notification-only stability review, multiple line-by-line passes, TestFirst fixes, no unrelated feature work.

## Global Constraints

- Work only on `audit/code25-notification-hardening-20260911`; do not modify the existing Code25 release branch during the audit.
- Keep `applicationId` and Code25 release identity unchanged during the audit.
- Use RED → minimal GREEN → full regression for every proven defect.
- Do not weaken notification permission, host allow-list, redirect, or dedupe safety checks.
- Do not claim physical-device PASS without a real device run.
- Keep one work cycle within the user's ~25-minute limit; checkpoint rather than rushing.

---

### Task 1: Notification Path and Existing-Test Audit

**Files:**
- Inspect: `android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java`
- Inspect: `android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java`
- Inspect: `android/app/src/main/java/com/innative/halkaarz/BackgroundRetryPolicy.java`
- Inspect: `android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java`
- Inspect: `android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java`
- Inspect: `android/app/src/main/java/com/innative/halkaarz/PushMessagingService.java`
- Inspect: `android/app/src/main/java/com/innative/halkaarz/MainActivity.java`
- Inspect: `android/app/src/main/AndroidManifest.xml`
- Inspect: `public/app.js`
- Inspect: `public/core/notification-rules.js`
- Inspect: notification-related tests under `test/`

**Interfaces:**
- Consumes: persisted alert config, portfolio holdings, Yahoo quote responses, notification permission/channel state.
- Produces: scheduled WorkManager jobs, foreground/native notification delivery, daily dedupe state, retry result.

- [ ] **Step 1: Read every production notification path and trace data from UI settings to Android delivery.**

- [ ] **Step 2: Read every existing notification regression test and map which production branch each test proves.**

- [ ] **Step 3: Record any uncovered branch or foreground/background semantic mismatch as a concrete hypothesis; do not edit production code yet.**

### Task 2: TestFirst Defect Closure

**Files:**
- Create or modify: a focused `test/android-notification-*.test.js` regression test for each proven defect.
- Modify only the production file directly responsible for that defect.

**Interfaces:**
- Consumes: hypotheses from Task 1.
- Produces: one RED→GREEN cycle per defect, with no speculative fixes.

- [ ] **Step 1: For the first proven defect, write one minimal test that fails on the untouched Code25 production code for the expected reason.**

- [ ] **Step 2: Run the focused test and capture RED evidence.**

- [ ] **Step 3: Apply the smallest production change that fixes the root cause.**

- [ ] **Step 4: Re-run the focused test and then the full regression suite.**

- [ ] **Step 5: Repeat Steps 1–4 separately for each additional proven defect; stop and re-investigate if a proposed fix does not make its own RED test GREEN.**

### Task 3: Repeated Notification Verification

**Files:**
- Verify: all notification production and test files above.
- Verify: Android release build inputs and assets.

**Interfaces:**
- Consumes: final audit-branch candidate.
- Produces: fresh evidence for tests, Java compilation/deprecation lint, synchronized assets, and release AAB build.

- [ ] **Step 1: Run the full Node regression suite and require zero failures.**

- [ ] **Step 2: Run Android asset synchronization/diff verification and require no drift.**

- [ ] **Step 3: Compile release Java with deprecation lint and require success.**

- [ ] **Step 4: Build and verify the release AAB.**

- [ ] **Step 5: Repeat the same complete verification at least two additional times on the same application-code SHA when tooling permits, and compare results.**

- [ ] **Step 6: Create a safe checkpoint; report remaining architectural limitations such as Android's 15-minute minimum periodic WorkManager cadence separately from code defects.**
