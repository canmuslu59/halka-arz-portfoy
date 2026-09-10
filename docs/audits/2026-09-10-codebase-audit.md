# Codebase Audit — 2026-09-10

## Outcome

Phase 1 source cleanup and hardening is complete at the code level. The production source tree is direct-source based, the Android bundled web assets are generated from `public/`, behavior-critical regressions are covered by tests, and the final Phase 1 verification gate is green.

This audit intentionally does **not** create a Play release, signed AAB, or release-signing workflow. The last published Play identity remains `versionCode 21 / versionName 2.3.9` until the separate release phase.

Final completion audit before this report:

- Workflow: `Audit Current Clean Source`
- Run: `34515569129`
- Event SHA: `42d441bd0fade19fe00ea51928f57ef9f60482dc`
- Full tests #1: **182/182 passed, 0 failed**
- Android asset synchronization/equality: **passed**
- Full tests #2: **passed**
- Independent parser / notification / navigation contracts: **passed**
- Android release Java compilation (`compileReleaseJavaWithJavac`): **passed**
- Android debug assembly (`assembleDebug`): **passed**
- Source hygiene (`git diff --check`) and Phase 1 no-AAB boundary: **passed**
- Final enforcement: **passed**

## What was fixed

### Source and build structure

- Production code is maintained directly instead of being reconstructed through historical Code17–22 delta/base64 payloads.
- `public/` is the canonical web source and `npm run android:sync` produces the Android web copy.
- Android build configuration is pinned for API 36 with compatible AGP/AndroidX versions and Java 17 verification.
- Phase 1 verification is separated from Play release packaging.

### Android shell and networking

- Native HTTP is asynchronous and uses an Activity-scoped bounded executor rather than an unbounded cached thread pool.
- WebView, delayed work, JavaScript bridge and executor are deterministically cleaned up on Activity destruction.
- Native HTTP accepts HTTPS only for an exact approved host set and manually validates redirects so redirect/suffix-host escape paths are rejected.
- Android back handling consumes deterministic SPA history first and uses double-back exit only at the application root.

### Persistence and concurrency

- Android portfolio storage verifies JSON, falls back from an invalid primary value to a valid backup, and preserves the previous valid primary before replacement.
- Server-side portfolio mutation is serialized to prevent lost updates.
- Server writes use temporary-file write, `fsync`, close and atomic rename semantics.
- Corrupt server persistence data is surfaced instead of silently resetting the portfolio.

### Notifications and background work

- Ordinary per-stock percentage movement notifications remain disabled by product rule.
- Per-stock notification behavior is limited to daily ceiling (`tavan`) and floor (`taban`) events; positive portfolio-level percentage thresholds remain supported.
- Delivery/deduplication state advances only after notification delivery succeeds.
- New IPO deduplication includes offering identity/date rather than ticker alone.
- IPO-only configurations remain scheduled even with an empty portfolio.
- Worker failures distinguish transient network/HTTP failures from permanent failures instead of silently swallowing or retrying every error.
- Notification permission is requested automatically only before the first user answer; a denied permission is not repeatedly auto-requested on every startup, while Settings can request it manually.

### SPA and refresh behavior

- Navigation state is deterministic across tabs, sheets/details, browser history and Android native back.
- Portfolio/history refreshes use single-flight coordination.
- A forced refresh requested behind a normal refresh is not lost, and duplicate forced refresh requests are coalesced.
- Existing valid cached market data is retained when refresh fails and market-data freshness remains visible.

### Parsers and caches

- Yahoo chart parsing protects finalized historical sessions from being overwritten by rolling intraday data while still backfilling missing sessions.
- IPO outage handling distinguishes a real confirmed no-match from total upstream failure so outage results are not cached for six hours as confirmed misses.
- Saved deterministic Ahlatcı active/upcoming, archive and detail HTML fixtures were added.
- Active IPO card parsing is scoped so the next section heading cannot leak into the previous card's consortium-leader value.
- The service-worker cache generation was advanced and the current application module graph is precached; network-first behavior and old-cache cleanup remain intact.

### Server HTTP hardening

- Request-body limits are enforced by UTF-8 byte size rather than JavaScript character count.
- Malformed Host headers return a controlled client error rather than escaping URL parsing.
- Finite header, request and keep-alive timeouts are configured.
- Existing PIN-header and static path-traversal protections remain covered by regression tests.

### Repository hygiene

- Obsolete release/reconstruction workflows, failed Phase 1 staging payloads, duplicate source trees, temporary applicators, old installation instructions and other dead artifacts were removed.
- Historical transform `.py` scripts were intentionally retained as migration/archive evidence but are no longer active build inputs.
- Regression test filenames were normalized away from historical release-number naming.
- The unused checked-in debug keystore was removed; `.gitignore` excludes local signing material (`*.keystore`, `*.jks`) and generated Android/build files.
- README now documents the direct-source verification path and the release-Java compile gate.

## Verification contract

The final Phase 1 gate requires all of the following to succeed:

```text
npm ci
npm test
npm run android:sync
diff -qr public android/app/src/main/assets/www
npm test
critical parser / notification / navigation contracts
gradle -p android --no-daemon compileReleaseJavaWithJavac
gradle -p android --no-daemon assembleDebug
git diff --check
no *.aab produced during Phase 1
```

Focused TDD additionally covers native HTTP policy, Activity lifecycle, worker retry policy, push configuration no-op behavior, server persistence/security, IPO outage caching, deterministic IPO fixtures, Android backup recovery and service-worker cache behavior.

## Retained external and product risks

These are known constraints rather than unresolved Phase 1 code defects:

- Yahoo Finance chart endpoints are public but unofficial and provide no application SLA; data may be delayed, incomplete or unavailable.
- Ahlatcı/Fibabanka HTML structures are third-party dependencies and can change. Deterministic fixtures protect known parser behavior, but upstream redesigns can still require parser updates.
- Render/Railway-style ephemeral filesystems can lose Node-server portfolio persistence without a persistent disk or database.
- Web and Android portfolio data are device/server-local and are not automatically synchronized with each other.
- Stock splits/bonus issues, dividends, additional purchases, brokerage fees and taxes are not modeled automatically as portfolio ledger events.
- Android background scheduling is ultimately subject to operating-system scheduling constraints.

## Intentionally unchanged in Phase 1

- Application/package identity: `com.innative.halkaarz`.
- Android `compileSdk 36`, `targetSdk 36`, `minSdk 26`.
- Published identity: `versionCode 21 / versionName 2.3.9`.
- Notification product rule: no ordinary per-stock percentage-rise notifications; only stock ceiling/floor plus positive portfolio-level thresholds.
- Existing core product/UI behavior except where a verified defect required a minimal fix.
- Release signing credentials remain private/outside the repository.
- No signed release AAB and no Play Store release were produced in Phase 1.

## Release boundary

Phase 1 ends with a clean, directly editable and regression-tested source tree. The next phase may choose a new `versionCode > 21`, select the release `versionName`, use the existing private signing identity, build the signed release AAB and perform release-specific validation. Those actions are deliberately outside this audit.
