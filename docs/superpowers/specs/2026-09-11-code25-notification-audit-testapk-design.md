# Code25 Notification + Audit Fixes Test APK Design

## Scope
Starting point is release commit `58a80b922888a83a78613b7e3a3ff3e60f030c50` (`v2.4.3`, versionCode 25). Fix audit findings 1, 2, 4, 5, 8 and 9, harden notification delivery, and add a debug-only test-notification control. Findings 3 (Play Billing / disabled Pro purchase flow) and 6 (2028+ market holiday calendar) must remain untouched.

## Architecture
- Keep production notifications local-first through WorkManager + `NotificationHelper`; remote FCM remains optional.
- Add an explicit notification diagnostic/status bridge so the UI can distinguish permission/channel/scheduler states and can open Android notification settings when blocked.
- The test notification action exists only when `BuildConfig.DEBUG` is true and calls the same native `NotificationHelper` path used by real local notifications.
- Move review-code validation and trial authority away from exposed JavaScript. The Android client uses a backend API when configured; local state is fallback-only and cannot expose a review code. Normal users do not see the review form unless the backend reports review mode available.
- Portfolio totals expose completeness. UI must not present a partial value as a complete portfolio total when any active holding lacks usable market data.
- Ahlatcı archive discovery follows pagination until no next page / no new results, with a conservative maximum safety cap rather than a fixed 12-page product limit.
- Privacy text explicitly discloses that notification configuration can include ticker and lot quantities when remote notification sync is enabled.

## Notification failure hypothesis
The existing worker can silently do nothing when permission/channel delivery is blocked and the UI has no diagnostic signal. Also, scheduling occurs only when config changes or startup `ensure()` sees persisted config. The fix will expose status, reschedule after permission/config changes, and provide a real native end-to-end debug notification trigger.

## Pro access security
A client APK cannot securely hide a reusable review code or make an uninstall/data-clear-proof trial solely with local storage. Secure authority must be server-side. The client therefore stops embedding the review code and supports server-validated review/trial state through the configured HTTPS backend; if backend authority is unavailable, no review code field is exposed. Existing purchase UI is intentionally unchanged.

## Test APK boundary
Debug builds use package suffix `.test` and app label `Halka Arz Portföyüm Test`. The test-notification button and any diagnostic copy are guarded by `BuildConfig.DEBUG` through the native bridge. Release/AAB builds do not expose the test button.
