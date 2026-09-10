# Halka Arz Portföyüm Codebase Cleanup Design

## Goal

Make the repository itself the single source of truth for the Android/Web app, remove the accumulated transform-chain build indirection, audit the full codebase for correctness and maintainability, fix confirmed defects, and leave the project in a clean state ready for a later release build. No AAB is produced in this phase.

## Scope

The audit covers the complete application path used by production:

- Android native shell and WebView bridge
- Notification permission, notification channels, routing and WorkManager background alerts
- IPO calendar background notifications and de-duplication
- Android back navigation and SPA history
- Web UI state, forms, rendering and local storage
- Portfolio calculations, history, caching and repository persistence
- Yahoo/Ahlatcı/Fibabanka data access and parsers
- BIST market-calendar logic
- Node server, static serving and optional PIN protection
- PWA/service-worker behavior
- Tests, CI workflows and build reproducibility

## Architecture

### 1. Flatten production source

Code18/19/20/21/22 transforms must be applied exactly once. Their resulting production files become normal committed files in the repository. CI must no longer reconstruct production code from historical delta archives before testing or building.

The resulting repository must satisfy: what is visible in GitHub is what is tested, synced into Android assets and later built into the release bundle.

### 2. Preserve behavior while improving boundaries

Do not rewrite the application from scratch. Existing working domain logic is retained. Large files may be split only where doing so removes a concrete correctness or testability problem. New modules must have one clear responsibility and stable interfaces.

### 3. Error handling

Silent catches are acceptable only for genuinely optional UI niceties. Data-source, persistence, notification, parser and background-worker failures must either be surfaced to the calling layer, recorded in state, or logged in a diagnosable way. A failure must not silently mark stale or partial data as successful fresh data.

### 4. Network/security

Native WebView HTTP access remains HTTPS-only and must be restricted to the hosts the app actually needs. Redirects must not escape the allowed-host policy. Response-size and timeout limits remain enforced.

### 5. Notifications

Notification permission state, channel creation and background scheduling must be internally consistent. IPO background checking must not depend on having portfolio holdings. Market alerts keep the current rule: no per-stock percentage-rise notifications; only ceiling/floor per stock plus configured portfolio-level percentage alerts. IPO notifications must de-duplicate by offering identity without suppressing a materially changed/new offering forever.

### 6. Navigation

Android back must first unwind app navigation state (sheet/detail/tab history where applicable). Only at app root should double-back exit behavior apply.

### 7. IPO data

Active/upcoming cards and archive rows are parsed separately and normalized into the same model. Consortium leader extraction must be card/detail scoped. Live NETGL data is a regression fixture target while it remains available, but permanent unit tests must use saved deterministic HTML fixtures so CI does not depend solely on the live website.

### 8. Persistence and calculations

Portfolio writes must remain recoverable using primary + backup data. Mutations must validate lot counts, prices and dates. Portfolio totals/history must never create NaN/Infinity output and must distinguish missing data from real zero values.

### 9. Tests and release boundary

Version-specific historical tests are converted into behavior contracts where still relevant. Obsolete tests are removed only when their behavior is intentionally replaced and the replacement behavior has an explicit test.

Phase 1 completion requires:

- repository flattened to direct production source
- full test suite green twice from a clean reconstruction
- Android Java release sources compile successfully
- web assets sync reproducibly and diff cleanly
- no AAB/release signing performed
- an audit report listing fixes, retained risks and intentionally untouched areas

## Non-goals

- New product features
- UI redesign
- New investment calculations unrelated to identified bugs
- Play Store release, signing or AAB generation
