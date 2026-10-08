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
- Virtual completed: 30 / 48 (62.5%)
- Physical completed: 9 / 9
- Crawl APIs 26,27,28,29 — PASS — matrix `matrix-3hb8nncaaf718`
- Instrumentation APIs 26,27 — PASS — matrix `matrix-1h977m8iv06pw`
- Instrumentation APIs 28,29 — PASS — matrix `matrix-h9sy0hnhshpva`
- Crawl APIs 30,31 — PASS — matrix `matrix-2xnkj0hag70eb`
- 2026-10-05 virtual executions used for Code43: 10
- Crawl APIs 32,33 — PASS — matrix `matrix-1hzzpqo1cheb2`
- Crawl APIs 34,35,36,37 — PASS — matrix `matrix-2rm81xekzz3hl`
- Crawl scenario complete across APIs 26–37.
- Instrumentation APIs 30,31,32,33 — PASS — matrix `matrix-1s851gfgz4nyy`
- Instrumentation APIs 34,35,36,37 — PASS — matrix `matrix-2d0k8kockkga3`.
- Instrumentation scenario complete across APIs 26–37.
- Samsung Galaxy S22 / API 36 — instrumentation PASS — matrix `matrix-1tv8cr4w1v21k`
- Google Pixel 11 / API 37 — instrumentation PASS — matrix `matrix-3ljuezftila5b`
- Nothing Phone (4a) / API 36 — instrumentation PASS — matrix `matrix-3vniwesnaiix7`
- Instrumentation physical coverage complete across Samsung / Pixel / Nothing.
- Samsung Galaxy S22 / API 36 — resilience PASS — matrix `matrix-v0cjrvba72rva`
- Google Pixel 11 / API 37 — resilience PASS — matrix `matrix-3s1xtd1s6bt2d`
- Nothing Phone (4a) / API 36 — resilience PASS — matrix `matrix-3ve0qjk8r99g1`
- Resilience physical coverage complete across Samsung / Pixel / Nothing.
- Samsung Galaxy S22 / API 36 — permissions PASS — matrix `matrix-1sd405e2vdhkc`
- Google Pixel 11 / API 37 — permissions PASS — matrix `matrix-1sg9vhulja26z`
- Nothing Phone (4a) / API 36 — permissions PASS — matrix `matrix-1f008x5mdiern`.
- Physical coverage complete: 9 / 9 PASS across Samsung / Pixel / Nothing.
- Resilience APIs 26,27,28,29,30,31 — PASS — matrix `matrix-1f98n36losw12`
- Current action: resilience APIs 32,33.


## Harness note
- Initial harness-only build failure was caused by legacy `apply-*` test mutation scripts re-adding methods already present in Code43.
- Those legacy mutation steps were removed from the Code43 workflow.
- This failure is not counted as an application compatibility failure.
- Code43 is tested source-pure after `npm run android:sync`, with only isolated test runner/dependencies added.


## 2026-10-07 quota checkpoint
- Virtual PASS: 20 / 48 (41.7%).
- Physical PASS: 9 / 9 (100%).
- Remaining virtual checks: 28.
- Remaining physical checks: 0.
- Physical quota reset on 2026-10-08 and final Nothing permissions passed. Virtual checks remain.
- Resume from this checkpoint when quota is available; do not count quota-invalid matrices as app failures.


## 2026-10-08 quota checkpoint
- Virtual PASS: 30 / 48 (62.5%).
- Physical PASS: 9 / 9 (100%).
- Completed today: instrumentation APIs 34–37 and resilience APIs 26–31.
- Remaining virtual checks: 18.
  - Resilience APIs 32–37: 6 checks.
  - Permissions APIs 26–37: 12 checks.
- Firebase accepted 10 virtual-device executions today; the next batch returned `TEST_QUOTA_EXCEEDED`.
- Test workflow now runs on GitHub-hosted `windows-latest`, so the local self-hosted runner is no longer required.
- Resume automatically when Firebase virtual quota resets.
