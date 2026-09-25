# Android Compatibility Test Queue

Branch: `ci/firebase-test-lab-20260925`

## Scope

The Android app declares `minSdk 26`, so compatibility coverage starts at API 26.
The queue covers API 26 through API 37.

Firebase Spark no-cost daily quota:
- 10 virtual-device test runs/day
- 5 physical-device test runs/day

We intentionally cap planned virtual usage at 8/day to leave 2 virtual runs for retries or diagnosis.

## Already verified

- Smoke/Robo: virtual Android API 36 and 37 — PASS
- Instrumentation: virtual API 36 and 37 — PASS
- Resilience: virtual API 37 — PASS
- Notification permission: physical Galaxy S22 / API 36 — PASS
- Updated six-test instrumentation suite: physical Galaxy S22 / API 36 — PASS

## Exhaustive virtual compatibility queue

Each API level is tested in four modes:
`crawl`, `instrumentation`, `resilience`, and `permissions`.

- [ ] Batch 1 — APIs 26,27,28,29 — crawl + instrumentation — 8 virtual runs
- [ ] Batch 2 — APIs 30,31,32,33 — crawl + instrumentation — 8 virtual runs
- [ ] Batch 3 — APIs 34,35,36,37 — crawl + instrumentation — 8 virtual runs
- [ ] Batch 4 — APIs 26,27,28,29 — resilience + permissions — 8 virtual runs
- [ ] Batch 5 — APIs 30,31,32,33 — resilience + permissions — 8 virtual runs
- [ ] Batch 6 — APIs 34,35,36,37 — resilience + permissions — 8 virtual runs

If an API level is not present in the current Firebase Test Lab catalog, record it as unavailable rather than substituting a different API level.

## Physical-device follow-up

After the six virtual batches pass, use remaining physical quota for manufacturer-specific checks:
- Samsung first
- Google/Pixel second
- one additional available OEM when useful

Do not exceed 5 physical runs in one day. Prefer 1–2 physical runs/day so failures can be rerun without billing.

## Rules

1. Never use the production Firebase push backend for general Test Lab automation.
2. Keep `PUSH_BACKEND_URL` blank in the isolated Test Lab APK.
3. Do not touch `main`; all compatibility work remains on this branch.
4. Record PASS/FAIL and matrix ID beside each completed batch.
5. A Firebase quota-exceeded result is not an application failure; retry after the daily quota resets.
