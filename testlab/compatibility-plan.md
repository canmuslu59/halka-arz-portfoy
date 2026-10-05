# Firebase Test Lab Compatibility Plan — Code43 / 2.5.9

## Tested source
- Base branch: `release/v2.5.9-code43`
- versionCode: 43
- versionName: 2.5.9
- Test branch: `ci/firebase-test-lab-code43-20261005`
- Production `main` is not modified.
- Debug Test Lab package remains isolated as `com.innative.halkaarz.test`.
- `PUSH_BACKEND_URL` must remain blank in Test Lab.

## Test matrix
All results below must be generated again for Code43. PASS results from Code37 are reference-only and do not count for this release.

### Virtual
- APIs 26–37
- Scenarios: crawl, instrumentation, resilience, permissions
- Target: 48/48 checks PASS

### Physical
After virtual coverage is healthy:
- Samsung physical: instrumentation / resilience / permissions
- Google Pixel physical: instrumentation / resilience / permissions
- Additional OEM physical: instrumentation / resilience / permissions
- Do not exceed 5 physical runs in a day; preserve retry capacity.

## Code43 checkpoint
- Virtual completed: 6 / 48 (12.5%)
- Physical completed: 0
- Crawl APIs 26,27,28,29 — PASS — matrix `matrix-3hb8nncaaf718`
- Instrumentation APIs 26,27 — PASS — matrix `matrix-1h977m8iv06pw`
- Current action: instrumentation APIs 28,29
