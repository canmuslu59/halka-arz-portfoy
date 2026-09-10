# Code23 Release Fix Plan

Base: `42209b78ec2425a66a9bd73c746d4a82443d4339`
Working branch: `release/v2.4.1-code23`
Safe base checkpoint: `checkpoint/code22-before-code23-20260911`
RED audit checkpoint: `checkpoint/code23-red-audit-20260911`

## Goals

1. Preserve background notifications when the UI/Activity is not running via WorkManager; document Android force-stop as the platform exception.
2. Reject future-dated sales before they mutate holdings.
3. Correct IPO offer-window parsing across New Year.
4. Add 2027 BIST religious holiday/half-day dates.
5. Force the five-minute calendar refresh to perform a real network refresh.
6. Persist foreground alert delivery state only after native notification delivery succeeds.
7. Package an in-app privacy policy and cache every required PWA module.
8. Consume IPO push deep-links and focus the matching calendar card.
9. Make Google Play review access temporary rather than a permanent local unlock.
10. Bump release identity to v2.4.1 / versionCode 23 and keep public assets synchronized into Android.

## Verification gates

- RED regression suite must fail on the old implementation for the intended reasons.
- `npm test` must be fully GREEN after fixes.
- `npm run android:sync`, clean asset diff, and `git diff --check` must pass.
- Release Java compile with deprecation lint must pass.
- `bundleRelease` must pass on CI.
- Final AAB must be signed only with the existing `halkaarz-upload` key and the known certificate SHA-256; no new upload key may be created.
- Final delivery package must not contain JKS/private-key/password material.

`3ec09b0...` remains a test-only RED checkpoint and is never a release base.
