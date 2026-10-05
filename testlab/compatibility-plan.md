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

- [x] Batch 1 — APIs 26,27,28,29 — crawl + instrumentation
  - [x] Crawl APIs 26,27,28,29 — PASS — matrix `matrix-17cq7zr550a33`
  - [x] Instrumentation initial matrix APIs 26,27,28,29 — correctly exposed a WebView lifecycle crash
  - [x] Fix: lifecycle-safe WebView callbacks — commit `cb28293342edf9f00a576baaf3e515a3bfdf6e2e`
  - [x] Instrumentation retry API 26 — PASS
  - [x] Instrumentation retry API 27 — PASS
  - [x] Instrumentation retry API 28 — PASS
  - [x] Instrumentation retry API 29 — PASS
  - Retry matrix for API 26 + 29: `matrix-3p7zmu9r8sqte`
  - Retry matrix for API 27 + 28: `matrix-3gzml2ue28iqu`
- [x] Batch 2 — APIs 30,31,32,33 — crawl + instrumentation — 8 virtual runs
  - [x] Crawl APIs 30,31,32,33 — PASS — matrix `matrix-v66at7wtdj0da`
  - [x] Instrumentation API 30 — PASS
  - [x] Instrumentation API 31 — PASS
  - [x] Instrumentation API 32 — PASS
  - [x] Instrumentation API 33 — PASS
  - Instrumentation matrix for API 30 + 31: `matrix-1fgumotj1ofwk`
  - Instrumentation matrix for API 32 + 33: `matrix-28kh60sayl0sb`
- [x] Batch 3 — APIs 34,35,36,37 — crawl + instrumentation — 8 virtual runs
  - [x] Crawl APIs 34,35,36,37 — PASS — matrix `matrix-2n95l0oxvh4dz`
  - [x] Instrumentation API 34 — PASS
  - [x] Instrumentation API 35 — PASS
  - [x] Instrumentation API 36 — PASS
  - [x] Instrumentation API 37 — PASS
  - Instrumentation matrix for API 34 + 35: `matrix-hdy7mmgbj2fla`
  - Instrumentation matrix for API 36 + 37: `matrix-28wv6gyass11r`
- [x] Batch 4 — APIs 26,27,28,29 — resilience + permissions — 8 virtual runs
  - [x] Resilience APIs 26,27,28,29 — PASS — matrix `matrix-2w97aw30zhnv1`
  - [x] Permissions API 26 — PASS
  - [x] Permissions API 27 — PASS
  - [x] Permissions API 28 — PASS
  - [x] Permissions API 29 — PASS
  - Permissions matrix for API 26 + 27: `matrix-t1i5h01xamo2a`
  - Permissions matrix for API 28 + 29: `matrix-j75mmpcljhdba`
- [x] Batch 5 — APIs 30,31,32,33 — resilience + permissions — 8 virtual runs
  - [x] Resilience APIs 30,31,32,33 — PASS — matrix `matrix-1k26cgkrc4onr`
  - [x] Permissions API 30 — PASS
  - [x] Permissions API 31 — PASS
  - [x] Permissions API 32 — PASS
  - [x] Permissions API 33 — PASS
  - Permissions matrix for API 30 + 31: `matrix-3ltvo9qt084dx`
  - Permissions matrix for API 32 + 33: `matrix-rokb70cn4cpka`
- [x] Batch 6 — APIs 34,35,36,37 — resilience + permissions — 8 virtual runs
  - [x] Resilience APIs 34,35,36,37 — PASS — matrix `matrix-2iy2cr7d6e6n7`
  - [x] Permissions API 34 — PASS
  - [x] Permissions API 35 — PASS
  - [x] Permissions API 36 — PASS
  - [x] Permissions API 37 — PASS
  - Permissions matrix for API 34 + 35: `matrix-av9ka69uxs4pa`
  - Permissions matrix for API 36 + 37: `matrix-208u3vty49s92`

If an API level is not present in the current Firebase Test Lab catalog, record it as unavailable rather than substituting a different API level.


## Next action

1. Batches 1 through 6 virtual compatibility are complete.
2. Physical Samsung Galaxy S22 / API 36 resilience — PASS — matrix `matrix-q14x3uqnaafoa`.
3. Physical Google Pixel 11 / API 37 instrumentation — PASS — matrix `matrix-3gf0ub8wqo0nv`.
4. Physical Nothing Phone (4a) / API 36 permissions — PASS — matrix `matrix-3jo99dpsw0l2h`.
5. Physical-device usage for 2026-10-01: 3 runs. Keep 2 physical runs available for diagnosis/retry.
6. Samsung permissions follow-up on 2026-10-02 — PASS — matrix `matrix-v9ltcvx643d4a`.
7. Google Pixel 11 / API 37 resilience follow-up on 2026-10-05 — PASS — matrix `matrix-2j2f6goghrtn4`.
8. Nothing Phone (4a) / API 36 instrumentation follow-up on 2026-10-05 — PASS — matrix `matrix-3juoajqoz6c04`.
9. Next physical follow-up: Google Pixel 11 permissions. Stop after this run today and keep two physical slots for diagnosis/retry.

## Physical-device follow-up

- [x] Samsung Galaxy S22 / API 36 — resilience PASS — matrix `matrix-q14x3uqnaafoa`
- [x] Samsung Galaxy S22 / API 36 — permissions PASS — matrix `matrix-v9ltcvx643d4a`
- [x] Google Pixel 11 / API 37 — instrumentation PASS — matrix `matrix-3gf0ub8wqo0nv`
- [x] Google Pixel 11 / API 37 — resilience PASS — matrix `matrix-2j2f6goghrtn4`
- [x] Nothing Phone (4a) / API 36 — permissions PASS — matrix `matrix-3jo99dpsw0l2h`
- [x] Nothing Phone (4a) / API 36 — instrumentation PASS — matrix `matrix-3juoajqoz6c04`

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
