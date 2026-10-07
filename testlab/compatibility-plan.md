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
- Virtual completed: 12 / 48 (25.0%)
- Physical completed: 0
- Crawl APIs 26,27,28,29 — PASS — matrix `matrix-3hb8nncaaf718`
- Instrumentation APIs 26,27 — PASS — matrix `matrix-1h977m8iv06pw`
- Instrumentation APIs 28,29 — PASS — matrix `matrix-h9sy0hnhshpva`
- Crawl APIs 30,31 — PASS — matrix `matrix-2xnkj0hag70eb`
- 2026-10-05 virtual executions used for Code43: 10
- Crawl APIs 32,33 — PASS — matrix `matrix-1hzzpqo1cheb2`
- Current action: crawl APIs 34,35,36,37


## Harness note
- Initial harness-only build failure was caused by legacy `apply-*` test mutation scripts re-adding methods already present in Code43.
- Those legacy mutation steps were removed from the Code43 workflow.
- This failure is not counted as an application compatibility failure.
- Code43 is tested source-pure after `npm run android:sync`, with only isolated test runner/dependencies added.
